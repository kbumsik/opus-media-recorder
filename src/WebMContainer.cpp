#include "WebMContainer.hpp"
#include "emscriptenImport.hpp"

Container::Container()
  : ContainerInterface(),
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
}

Container::~Container()
{
  segment_.Finalize();
}

void Container::init(uint32_t sample_rate, uint8_t channel_count, int serial)
{
  ContainerInterface::init(sample_rate, channel_count, serial);

  // Add a track.
  // TODO: support for multiple tracks
  addTrack();
}

void Container::writeFrame(void *data, std::size_t size, int num_samples)
{
  // TODO: calculate paused time???
  uint64_t timestamp = ((uint64_t)(num_samples * 1000000ull)) / (uint64_t)sample_rate_;
  // uint64_t timestamp = 20 * 1000;

  if (force_one_libwebm_error_) {
    force_one_libwebm_error_ = false;
    throw "WebM: Forcing error";
  }

  segment_.AddFrame(reinterpret_cast<const uint8_t*>(data),
                    size, track_number_, most_recent_timestamp_ * 1000,
                    true); /* is_key: -- always true for audio */
  most_recent_timestamp_ += timestamp;
}

mkvmuxer::int32 Container::Write(const void* buf, mkvmuxer::uint32 len) {
  emscriptenPushBuffer(buf, len);
  position_ += len;
  return 0;
}

mkvmuxer::int64 Container::Position() const
{
  return position_;
}

mkvmuxer::int32 Container::Position(mkvmuxer::int64 position)
{
  // Is not Seekable() so it always returns fail
  return -1;
}

bool Container::Seekable() const
{
  return false;
}

void Container::ElementStartNotify(mkvmuxer::uint64 element_id,
                                   mkvmuxer::int64 position)
{
  // TODO: Not used in this project, not sure if I should something here.
  return;
}

void Container::addTrack(void)
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
  writeOpusIdHeader(opus_header);

  if (!audio_track->SetCodecPrivate(opus_header, ID_OPUS_SIZE)) {
    throw "WebM: failed to set opus header";
  }

  // Segment's timestamps should be in milliseconds
  // See http://www.webmproject.org/docs/container/#muxer-guidelines
  if (1000000ull != segment_.GetSegmentInfo()->timecode_scale()) {
    throw "WebM: Timecode resolution error";
  }
}
