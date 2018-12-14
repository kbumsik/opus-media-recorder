#include "WebMContainer.hpp"
#include <string>
#include <cstring>
#include "EmscriptenJSWriter.hpp"

// See OggContainer::produceIDPage for more detail
enum {
  ID_OPUS_MAGIC_OFFSET = 0,
  ID_OPUS_VER_OFFSET = 8,
  ID_OPUS_CH_OFFSET = 9,
  ID_OPUS_PRE_SKIP_OFFSET = 10,
  ID_OPUS_SAMPLE_RATE_OFFSET = 12,
  ID_OPUS_GAIN_OFFSET = 16,
  ID_OPUS_MAPPING_FAMILY_OFFSET = 18
};
#define ID_OPUS_SIZE (ID_OPUS_MAPPING_FAMILY_OFFSET + 1)


WebMContainer::WebMContainer(uint32_t sample_rate, uint8_t channel_count, int serial)
  : sample_rate_(sample_rate),
    channel_count_(channel_count),
    safe_to_copy_(false),
    position_(0),
    force_one_libwebm_error_(false),
    first_frame_timestamp_audio_(0),
    most_recent_timestamp_(0),
    track_number_(0)
{
  // Init the segment
  segment_.Init(this);
  segment_.set_mode(mkvmuxer::Segment::kLive);
  segment_.OutputCues(false); // This is live streams so cues may not be feasible
  // Info
  mkvmuxer::SegmentInfo* const info = segment_.GetSegmentInfo();
  info->set_writing_app("opus-media-recorder");
  info->set_muxing_app("opus-media-recorder");

  // Add a track.
  // TODO: support for multiple tracks
  addTrack();
}

WebMContainer::~WebMContainer()
{
  segment_.Finalize();
}

mkvmuxer::int32 WebMContainer::Write(const void* buf, mkvmuxer::uint32 len) {
  queueBuffer(buf, len);
  position_ += len;
  return 0;
}

mkvmuxer::int64 WebMContainer::Position() const
{
  return position_;
}

mkvmuxer::int32 WebMContainer::Position(mkvmuxer::int64 position)
{
  // Is not Seekable() so it always returns fail
  return -1;
}

bool WebMContainer::Seekable() const
{
  return false;
}

void WebMContainer::ElementStartNotify(mkvmuxer::uint64 element_id,
                                   mkvmuxer::int64 position)
{
  // TODO: Not used in this project, not sure if I should something here.
  return;
}

void WebMContainer::addTrack(void)
{
  track_number_ = segment_.AddAudioTrack(sample_rate_, channel_count_, 0);
  if (track_number_ <= 0) {
    throw "Error adding audio track";
  }

  mkvmuxer::AudioTrack* const audio_track =
      reinterpret_cast<mkvmuxer::AudioTrack*>(
          segment_.GetTrackByNumber(track_number_));

  // Audio data is always pcm_f32le.
  audio_track->set_bit_depth(32u);
  // TODO: Add PCM
  audio_track->set_codec_id(mkvmuxer::Tracks::kOpusCodecId);

  uint8_t opus_header[ID_OPUS_SIZE];
  writeOpusHeader(opus_header);

  if (!audio_track->SetCodecPrivate(opus_header, ID_OPUS_SIZE)) {
    throw "WebM: failed to set opus header";
  }

  // Segment's timestamps should be in milliseconds
  // See http://www.webmproject.org/docs/container/#muxer-guidelines
  if (1000000ull != segment_.GetSegmentInfo()->timecode_scale()) {
    throw "WebM: Timecode resolution error";
  }
}

void WebMContainer::writeOpusHeader(uint8_t *header)
{
  // Magic Signature 'OpusHead'
  const static std::string magic = "OpusHead";
  std::memcpy(header + ID_OPUS_MAGIC_OFFSET, magic.c_str(), magic.size());
  // The version must always be 1 (8 bits, unsigned).
  header[ID_OPUS_VER_OFFSET] = 1;
  // Number of output channels (8 bits, unsigned).
  header[ID_OPUS_CH_OFFSET] = channel_count_;
  // Number of samples (at 48 kHz) to discard from the decoder output when
  // starting playback (16 bits, unsigned, little endian).
  // Currently pre-skip is 80ms.
  const uint16_t pre_skip = 3840;
  std::memcpy(header + ID_OPUS_PRE_SKIP_OFFSET, &pre_skip, sizeof(uint16_t));
  // The sampling rate of input source (32 bits, unsigned, little endian).
  std::memcpy(header + ID_OPUS_SAMPLE_RATE_OFFSET, &sample_rate_, sizeof(uint32_t));
  // Output gain, an encoder should set this field to zero (16 bits, signed,
  // little endian).
  const uint16_t gain = 0;
  std::memcpy(header + ID_OPUS_GAIN_OFFSET, &gain, sizeof(uint16_t));
  // Channel Mapping Family 0: mono or stereo (left, right). (8 bits, unsigned).
  header[ID_OPUS_MAPPING_FAMILY_OFFSET] = 0;
}

void WebMContainer::writeFrame(void *data, std::size_t size, int num_samples)
{
  // TODO: calculate paused time???
  uint64_t timestamp = sample_rate_ / num_samples
                      * segment_.GetSegmentInfo()->timecode_scale();
  most_recent_timestamp_ += timestamp;

  if (force_one_libwebm_error_) {
    force_one_libwebm_error_ = false;
    throw "WebM: Forcing error";
  }

  segment_.AddFrame(reinterpret_cast<const uint8_t*>(data),
                    size, track_number_, most_recent_timestamp_ * 1000,
                    true); /* is_key: -- always true for audio */
}