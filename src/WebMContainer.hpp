#ifndef WEBMCONTAINER_H_
#define WEBMCONTAINER_H_

#include <cstdint>
#include <cstddef>
#include "lib/webm/mkvmuxer.hpp"
#include "ContainerInterface.hpp"

class Container
  : protected ContainerInterface,
    public mkvmuxer::IMkvWriter
{
  public:
    /**
     * @brief Construct a new Ogg Container object
     *
     * @param sample_rate     Sampling rate of the stream
     * @param channel_count   The number of channels of the stream the maxium is 2.
     * @param serial          Uniqute number of the stream. Usually a random number.
     */
    Container();
    ~Container();

    void init(uint32_t sample_rate, uint8_t channel_count, int serial) override;

    void writeFrame(void *data, std::size_t size, int num_samples) override;

    // IMkvWriter interface.
    mkvmuxer::int32 Write(const void *buf, mkvmuxer::uint32 len) override;
    mkvmuxer::int64 Position() const override;
    mkvmuxer::int32 Position(mkvmuxer::int64 position) override;
    bool Seekable() const override;
    void ElementStartNotify(mkvmuxer::uint64 element_id,
                            mkvmuxer::int64 position) override;

  private:
    void addTrack(void);

    // Rolling counter of the position in bytes of the written goo.
    mkvmuxer::int64 position_;
    // The MkvMuxer active element.
    mkvmuxer::Segment segment_;
    // Flag to force the next call to a |segment_| method to return false.
    bool force_one_libwebm_error_;
    uint64_t first_frame_timestamp_audio_;
    uint64_t most_recent_timestamp_;
    uint64_t track_number_;
};

#endif /* WEBMCONTAINER_H_ */
