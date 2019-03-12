#include <cassert>
#include "WebMContainer.hpp"
#include "emscriptenImport.hpp"

Container::Container()
  : ContainerInterface(),
    position_(0),
    timestamp_(0),
    track_number_(0)
{
  // Init the segment
  segment_.Init(this);
  segment_.set_mode(mkvmuxer::Segment::kLive);
  segment_.OutputCues(false); // This is live streams so cues may not be feasible

  // Write segment info
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
  assert(data);
  // TODO: calculate paused time???
  uint64_t timestamp = ((uint64_t)(num_samples * 1000000ull)) / (uint64_t)sample_rate_;
  // uint64_t timestamp = 20 * 1000;

  segment_.AddFrame(reinterpret_cast<const uint8_t*>(data),
                    size, track_number_, timestamp_ * 1000,
                    true); /* is_key: -- always true for audio */
  timestamp_ += timestamp;
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
  // TODO: Not used in this project, not sure if I should do something here.
  return;
}

void Container::addTrack(void)
{
  track_number_ = segment_.AddAudioTrack(sample_rate_, channel_count_, 0);
  assert(track_number_ > 0); // Init failed

  mkvmuxer::AudioTrack* const audio_track =
      reinterpret_cast<mkvmuxer::AudioTrack*>(
          segment_.GetTrackByNumber(track_number_));

  // Audio data is always pcm_float32le.
  audio_track->set_bit_depth(32u);
  audio_track->set_codec_id(mkvmuxer::Tracks::kOpusCodecId);

  uint8_t opus_header[OpusIdHeaderType::SIZE];
  writeOpusIdHeader(opus_header);

  // Init failed
  assert(audio_track->SetCodecPrivate(opus_header, OpusIdHeaderType::SIZE));

  // Segment's timestamps should be in milliseconds
  // See http://www.webmproject.org/docs/container/#muxer-guidelines
  assert(1000000ull == segment_.GetSegmentInfo()->timecode_scale());
}
