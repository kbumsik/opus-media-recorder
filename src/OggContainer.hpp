#ifndef OggContainer_h_
#define OggContainer_h_

#include <cstdint>
#include "ogg/ogg.h"

/**
 * @brief Ogg Container class
 *
 * ## Reference
 *
 *    Ogg: https://en.wikipedia.org/wiki/Ogg_page
 *    OggOpus: https://tools.ietf.org/html/rfc3533
 *             https://tools.ietf.org/html/rfc7845
 *
 * ## OggOpus Packet organization
 *
 *      Page 0         Pages 1 ... n        Pages (n+1) ...
 *   +------------+ +---+ +---+ ... +---+ +-----------+ +---------+ +--
 *   |            | |   | |   |     |   | |           | |         | |
 *   |+----------+| |+-----------------+| |+-------------------+ +-----
 *   |||ID Header|| ||  Comment Header || ||Audio Data Packet 1| | ...
 *   |+----------+| |+-----------------+| |+-------------------+ +-----
 *   |            | |   | |   |     |   | |           | |         | |
 *   +------------+ +---+ +---+ ... +---+ +-----------+ +---------+ +--
 *   ^      ^                           ^
 *   |      |                           |
 *   |      |                           Mandatory Page Break
 *   |      |
 *   |      ID header is contained on a single page
 *   |
 *   'Beginning Of Stream'
 *
 * ## How to use
 *
 *    Overall code flow:
 *      1. Instantiate.
 *      2. Call produceIDPage() then copy produced Ogg page (must be one page).
 *      3. Call produceCommentPage() them copy produced Ogg pages (MAY be multipe pages).
 *      4. Call writeStream() to input encoded frames.
 *      5. You can call producePacketPage() whenever you need accumulated Ogg pages.
 *      6. Call the last writeStream() with e_o_s being true.
 *      7. Call producePacketPage() to copy the rest of Ogg pages.
 *
 *    Step to copy Ogg pages:
 *      1. Call producePacketPage(), produceIDPage(), or produceCommentPage()
 *           to generate an ogg page.
 *      2. Get pointers and size of header/body of the ogg page by calling
 *          getOggHeader(), getOggHeaderSize(), getOggBody(), getOggBodySize().
 *      3. Copy buffers using the pointers manually.
 *      4. If producePacketPage() return non-zero value, iterate from step 1.
 */
class OggContainer
{
public:
  /**
   * @brief Construct a new Ogg Container object
   *
   * @param sample_rate     Sampling rate of the stream
   * @param channel_count   The number of channels of the stream the maxium is 2.
   * @param serial          Uniqute number of the stream. Usually a random number.
   */
  OggContainer(uint32_t sample_rate, uint8_t channel_count, int serial);
  ~OggContainer();

  void writeStream(void *data, ssize_t size, int num_samples, bool e_o_s = false);

  void produceIDPage(void);
  void produceCommentPage(void);
  int producePacketPage(bool force = false);

  bool safeToCopy(void);
  void* getOggHeader(void);
  long getOggHeaderSize(void);

  void* getOggBody(void);
  long getOggBodySize(void);
private:
  /**
   * @brief   Insert data (or a packet). The inserted data can be later collected
   *          as Ogg pages by calling producePacketPage().
   *
   * @param data          A pointer to the packet buffer
   * @param size          Byte size of the packet data
   * @param num_samples   if < 0, the packet is considered as metadata packet
   * @param e_o_s         Set if this is the last packet
   */
  void writePacket(uint8_t *data, ssize_t size, int num_samples, bool e_o_s = false);

  uint32_t sample_rate_;
  uint8_t channel_count_;
  bool safe_to_copy_;
  ogg_stream_state stream_state_;
  ogg_page page_;
  ogg_packet packet_;
};

#endif
