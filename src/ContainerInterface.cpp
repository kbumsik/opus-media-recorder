#include "ContainerInterface.hpp"

ContainerInterface::ContainerInterface()
  : sample_rate_(48000),
    channel_count_(1)
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

void ContainerInterface::writeOpusIdHeader(uint8_t *header)
{
  /**
   * @brief ID header format: https://tools.ietf.org/html/rfc7845#section-5.1
   *
   *     0                   1                   2                   3
   *     0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
   *    +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
   *    |      'O'      |      'p'      |      'u'      |      's'      |
   *    +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
   *    |      'H'      |      'e'      |      'a'      |      'd'      |
   *    +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
   *    |  Version = 1  | Channel Count |           Pre-skip            |
   *    +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
   *    |                     Input Sample Rate (Hz)                    |
   *    +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
   *    |   Output Gain (Q7.8 in dB)    | Mapping Family|               |
   *    +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+               :
   *    |                                                               |
   *    :               Optional Channel Mapping Table...               :
   *    |                                                               |
   *    +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
   */
  // Reference for WebM: https://wiki.xiph.org/MatroskaOpus

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


void ContainerInterface::writeOpusCommentHeader(uint8_t *header)
{
  /**
   * @brief Comment header format: https://tools.ietf.org/html/rfc7845#section-5.2
   *
   *   0                   1                   2                   3
   *   0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
   *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
   *  |      'O'      |      'p'      |      'u'      |      's'      |
   *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
   *  |      'T'      |      'a'      |      'g'      |      's'      |
   *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
   *  |                     Vendor String Length                      |
   *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
   *  |                                                               |
   *  :                        Vendor String...                       :
   *  |                                                               |
   *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
   *  |                   User Comment List Length                    |
   *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
   *  |                 User Comment #0 String Length                 |
   *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
   *  |                                                               |
   *  :                   User Comment #0 String...                   :
   *  |                                                               |
   *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
   *  |                 User Comment #1 String Length                 |
   *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
   */

  // Magic Signature 'OpusTags'
  const static std::string magic = "OpusTags";
  std::memcpy(header + COMMENT_OPUS_MAGIC_OFFSET, magic.c_str(), magic.size());
  // Vendor String 'opus-media-recorder'
  const static std::string vendor = "opus-media-recorder";
  uint32_t vendor_size = vendor.size();
  std::memcpy(header + COMMENT_OPUS_VENDOR_LEN_OFFSET,
              &vendor_size, sizeof(uint32_t));
  std::memcpy(header + COMMENT_OPUS_VENDOR_STR_OFFSET,
              vendor.c_str(), vendor.size());
  // Comment list length = 1 (32 bits, unsigned, little endian)
  uint32_t list_length = 1;
  std::memcpy(header + COMMENT_OPUS_COMMENT_LIST_LEN_OFFSET,
              &list_length, sizeof(uint32_t));
  // User Comment
  const static std::string title = "TITLE=recording";
  // User Comment #i String Length (32 bits, unsigned, little endian)
  uint32_t title_size = title.size();
  std::memcpy(header + COMMENT_OPUS_COMMENT_0_LEN_OFFSET,
              &title_size, sizeof(uint32_t));
  // User Comment # 1 ['TITLE=recording']
  std::memcpy(header + COMMENT_OPUS_COMMENT_0_STR_OFFSET,
              title.c_str(), title.size());
}