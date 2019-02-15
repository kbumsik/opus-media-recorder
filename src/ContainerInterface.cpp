#include "ContainerInterface.hpp"

ContainerInterface::ContainerInterface()
  : sample_rate_(48000),
    channel_count_(1),
    safe_to_copy_(false)
{
  // Nothing to do
}

ContainerInterface::~ContainerInterface()
{
  // Nothing to do
}

void ContainerInterface::init(uint32_t sample_rate, uint8_t channel_count, int serial)
{
  sample_rate_ = sample_rate;
  channel_count_ = channel_count;
}

void ContainerInterface::writeOpusHeader(uint8_t *header)
{
  // Reference: https://wiki.xiph.org/MatroskaOpus
  // Magic Signature 'OpusHead'
  const static std::string magic = "OpusHead";
  std::memcpy(header + ID_OPUS_MAGIC_OFFSET, magic.c_str(), magic.size());
  // The version must always be 1 (8 bits, unsigned).
  header[ID_OPUS_VER_OFFSET] = 1;
  // Number of output channels (8 bits, unsigned).
  header[ID_OPUS_CH_OFFSET] = channel_count_;
  // Firefox seems to have problem with non-zero pre-skip.
  // Related topic: https://wiki.xiph.org/MatroskaOpus#Proposal_2:_Use_pre-skip_data_from_CodecPrivate
  const uint16_t pre_skip = 0;
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
