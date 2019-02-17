interface OggContainer {
  void OggContainer();
  void init(long sample_rate, short channel_count, long serial);
  void writeFrame(any data, unsigned long size, long num_samples);
};