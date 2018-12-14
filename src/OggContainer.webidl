interface OggContainer {
  void OggContainer(long sample_rate, short channel_count, long serial);
  void writeStream(any data, unsigned long size, long num_samples, boolean e_o_s);
  void produceIDPage();
  void produceCommentPage();
  long producePacketPage(boolean force);
  boolean safeToCopy();
  any getOggHeader();
  long getOggHeaderSize();
  any getOggBody();
  long getOggBodySize();
};