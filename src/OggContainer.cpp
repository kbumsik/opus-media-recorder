#include "OggContainer.hpp"
#include "emscriptenImport.hpp"
#include <vector>
#include <string>
#include <cstdlib>
#include <cstring>
#include <cassert>

Container::Container()
  : ContainerInterface(),
    stream_state_(),
    page_(),
    packet_()
{
  // Nothing to do
}

Container::~Container()
{
  writePacket(nullptr, 0, 0, true); // This does nothing but marks end_of_stream
  while (producePacketPage(true) != 0) {} // Produce the last page
  ogg_stream_clear(&stream_state_);
}

void Container::init(uint32_t sample_rate, uint8_t channel_count, int serial)
{
  ContainerInterface::init(sample_rate, channel_count, serial);

  int result = ogg_stream_init(&stream_state_, serial);
  assert(result == 0);  // Init failed

  packet_.b_o_s = 1;
  packet_.e_o_s = 0;
  packet_.granulepos = 0;
  packet_.packet = nullptr;
  packet_.packetno = 0;
  packet_.bytes = 0;

  // Generate ID Page
  produceIDPage();
  // produce ID page
  produceCommentPage();
}

void Container::writeFrame(void *data, std::size_t size, int num_samples)
{
  writePacket((uint8_t *)data, size, num_samples, false);
  while (producePacketPage(false) != 0) {}
}
void Container::produceIDPage(void)
{
  std::vector<uint8_t> tmp_buffer(OpusIdHeaderType::SIZE);
  uint8_t *header = &tmp_buffer[0];
  writeOpusIdHeader(header);

  // Produce an OGG page
  writePacket(header, tmp_buffer.size(), -1);
  int result = producePacketPage(true);
  assert(result != 0); // Unexpected error
}

void Container::produceCommentPage(void)
{
  std::vector<uint8_t> tmp_buffer(OpusCommentHeaderType::SIZE);
  uint8_t *header = &tmp_buffer[0];
  writeOpusCommentHeader(header);

  // Produce an OGG page
  writePacket(header, tmp_buffer.size(), -1);
  int result = producePacketPage(true);
  assert(result != 0);  // Unexpected error
}

int Container::producePacketPage(bool force)
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
  // result == 0 means no page to produce, or internal error has occurred.
  // You should NOT copy page in this case.
  // Nonzero value means operation successful.
  if (result == 0) {
    assert(!ogg_stream_check(&stream_state_)); // Allocation error
  } else {
    emscriptenPushBuffer(page_.header, page_.header_len);
    emscriptenPushBuffer(page_.body, page_.body_len);
  }
  return result;
}

void Container::writePacket(uint8_t *data, std::size_t size,
                              int num_samples, bool e_o_s)
{
  assert(!(data == nullptr && size > 0)); // No copy more than zero over null
  assert(!ogg_stream_eos(&stream_state_)); // Already end-of-stream

  // After setting End-Of-Stream, there must be no more packet to write
  if (e_o_s) {
    packet_.e_o_s = 1;
  }

  if (data) {
    packet_.packet = data;
  }
  packet_.bytes = size;
  if (num_samples < 0) {
    // The granule position of ID/comment pages should be zero
    packet_.granulepos = 0;
  } else {
    packet_.granulepos += num_samples;
  }

  int result = ogg_stream_packetin(&stream_state_, &packet_);
  assert(result == 0); // Allocation error

  // Begingging-Of-Stream must be cleared after the first page
  if (packet_.b_o_s) {
    packet_.b_o_s = 0;
  }
  packet_.packetno++;
  packet_.packet = nullptr;
}
