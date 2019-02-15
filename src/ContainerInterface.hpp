#ifndef CONTAINERINTERFACE_H_
#define CONTAINERINTERFACE_H_

#include <cstdint>
#include <cstring>
#include <string>

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

class ContainerInterface
{
public:
  ContainerInterface();
  ~ContainerInterface();

  /**
   * @brief Initialize a new Ogg Container object
   *
   * @param sample_rate     Sampling rate of the stream
   * @param channel_count   The number of channels of the stream the maximum is 2.
   * @param serial          Unique number of the stream. Usually a random number.
   */
  virtual void init(uint32_t sample_rate, uint8_t channel_count, int serial);

  /**
   * @brief   Insert data (or a packet). The inserted data can be later collected
   *          as Ogg pages by calling producePacketPage().
   *
   * @param data          A pointer to the packet buffer
   * @param size          Byte size of the packet data
   * @param num_samples   if < 0, the packet is considered as metadata packet
   * @param e_o_s         Set if this is the last packet
   */
  virtual void writeFrame(void *data, std::size_t size, int num_samples) = 0;

protected:
  uint32_t sample_rate_;
  uint8_t channel_count_;
  bool safe_to_copy_;

  void writeOpusHeader(uint8_t *header);
};

#endif /* CONTAINERINTERFACE_H_ */
