#include "OggContainer.hpp"
#include "ogg/ogg.h"
#include <vector>
#include <string>
#include <cstdlib>
#include <cstring>

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

// See OggContainer::produceCommentPage for more detail
enum {
  COMMENT_OPUS_MAGIC_OFFSET = 0,
  COMMENT_OPUS_VENDOR_LEN_OFFSET = 8,
  COMMENT_OPUS_VENDOR_STR_OFFSET = 12,
  // COMMENT_OPUS_VENDOR_STR_OFFSET + 'Opus-Media-Recorder'
  COMMENT_OPUS_COMMENT_LIST_LEN_OFFSET = (COMMENT_OPUS_VENDOR_STR_OFFSET + 19),
  COMMENT_OPUS_COMMENT_0_LEN_OFFSET = (COMMENT_OPUS_COMMENT_LIST_LEN_OFFSET +4),
  COMMENT_OPUS_COMMENT_0_STR_OFFSET = (COMMENT_OPUS_COMMENT_0_LEN_OFFSET +4)
};
// COMMENT_OPUS_COMMENT_0_STR_OFFSET + 'TITLE=recording'
#define COMMENT_OPUS_SIZE (COMMENT_OPUS_COMMENT_0_STR_OFFSET + 15)


OggContainer::OggContainer(uint32_t sample_rate, uint8_t channel_count, int serial)
  : sample_rate_(sample_rate),
    channel_count_(channel_count),
    safe_to_copy_(false),
    stream_state_(),
    page_(),
    packet_()
{
  int result = ogg_stream_init(&stream_state_, serial);
  if (result != 0) {
    throw "Ogg: Object initialization failed";
  }

  packet_.b_o_s = 1;
  packet_.e_o_s = 0;
  packet_.granulepos = 0;
  packet_.packet = nullptr;
  packet_.packetno = 0;
  packet_.bytes = 0;
}

OggContainer::~OggContainer()
{
  ogg_stream_clear(&stream_state_);
}

void OggContainer::writeStream(void *data, ssize_t size,
                              int num_samples, bool e_o_s)
{
  writePacket((uint8_t *)data, size, num_samples, e_o_s);
}
void OggContainer::produceIDPage(void)
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
  std::vector<uint8_t> tmp_buffer(ID_OPUS_SIZE);
  uint8_t *header = &tmp_buffer[0];
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

  // Produce an OGG page
  writePacket(header, tmp_buffer.size(), -1);
  int result = producePacketPage(true);
  if (result == 0) {
    throw "Ogg: Generating OggOpus ID page failed";
  }
}

void OggContainer::produceCommentPage(void)
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
  std::vector<uint8_t> tmp_buffer(COMMENT_OPUS_SIZE);
  uint8_t *header = &tmp_buffer[0];
  // Magic Signature 'OpusTags'
  const static std::string magic = "OpusTags";
  std::memcpy(header + COMMENT_OPUS_MAGIC_OFFSET, magic.c_str(), magic.size());
  // Vendor String 'Opus-Media-Recorder'
  const static std::string vendor = "Opus-Media-Recorder";
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

  // Produce an OGG page
  writePacket(header, tmp_buffer.size(), -1);
  int result = producePacketPage(true);
  if (result == 0) {
    throw "Ogg: Generating OggOpus Comment page failed";
  }
}


int OggContainer::producePacketPage(bool force)
{
  /**
   * @brief Ogg page header format: https://tools.ietf.org/html/rfc3533#section-6
   *
   *   0                   1                   2                   3
   *   0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1| Byte
   *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
   *  | capture_pattern: Magic number for page start "OggS"           | 0-3
   *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
   *  | version       | header_type   | granule_position              | 4-7
   *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
   *  |                                                               | 8-11
   *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
   *  |                               | bitstream_serial_number       | 12-15
   *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
   *  |                               | page_sequence_number          | 16-19
   *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
   *  |                               | CRC_checksum                  | 20-23
   *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
   *  |                               |page_segments  | segment_table | 24-27
   *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
   *  | ...                                                           | 28-
   *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
   */
  int result;
  if (force) {
    result = ogg_stream_flush(&stream_state_, &page_);
  } else {
    result = ogg_stream_pageout(&stream_state_, &page_);
  }
  // result == 0 means no page to produce, or internal error has occured.
  // You should NOT copy page in this case.
  // Nonzero value means operation successful.
  safe_to_copy_ = (result == 0) ? false : true;
  return result;
}

bool OggContainer::safeToCopy(void)
{
  return safe_to_copy_;
}

void* OggContainer::getOggHeader(void)
{
  return page_.header;
}

long OggContainer::getOggHeaderSize(void)
{
  return page_.header_len;
}

void* OggContainer::getOggBody(void)
{
  return page_.body;
}

long OggContainer::getOggBodySize(void)
{
  return page_.body_len;
}

void OggContainer::writePacket(uint8_t *data, ssize_t size,
                              int num_samples, bool e_o_s)
{
  if (ogg_stream_eos(&stream_state_)) {
    throw "Ogg: Object is already flagged as end-of-stream";
  }

  // After setting End-Of-Stream, there must be no more packet to write
  if (e_o_s) {
    packet_.e_o_s = 1;
  }

  packet_.packet = data;
  packet_.bytes = size;
  if (num_samples < 0) {
    // The granule position of ID/comment pages should be zero
    packet_.granulepos = 0;
  } else {
    packet_.granulepos += num_samples;
  }

  int result = ogg_stream_packetin(&stream_state_, &packet_);
  safe_to_copy_ = false;
  if (result != 0) {
    throw "Ogg: Putting the stream failed";
  }

  // Begingging-Of-Stream must be cleared after the first page
  if (packet_.b_o_s) {
    packet_.b_o_s = 0;
  }
  packet_.packetno++;
  packet_.packet = nullptr;
}
