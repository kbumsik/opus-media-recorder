LIB_DIR = ./lib
SRC_DIR = ./src
export BUILD_DIR = $(abspath ./build)
DIST_DIR = ./dist

# For Emscripten
EMCC_OPTS=-O3 --llvm-lto 1 -s NO_DYNAMIC_EXECUTION=1 -s NO_FILESYSTEM=1
DEFAULT_EXPORTS:='_malloc','_free'
OPUS_EXPORTS:='_opus_encoder_create','_opus_encode_float','_opus_encoder_ctl'
SPEEX_EXPORTS:='_speex_resampler_init','_speex_resampler_process_interleaved_float','_speex_resampler_destroy'

# C compiled static libraries
export OPUS_OBJ = $(BUILD_DIR)/libopus.a
export OGG_OBJ = $(BUILD_DIR)/libogg.a
export SPEEX_OBJ = $(BUILD_DIR)/libspeexdsp.a

# JavaScript intermediate builds
OGG_OPUS_JS = $(BUILD_DIR)/OggOpusWorker.js

# Final targets
OGG_OPUS_WORKER = $(DIST_DIR)/OggOpusWorker.js

.PHONY: all clean

all: $(OGG_OPUS_WORKER)

$(DIST_DIR):
	mkdir $@

# Building libraries
$(BUILD_DIR)/%.js: $(SRC_DIR)/%.js
	npm run build

$(BUILD_DIR)/%.a:
	make -C $(LIB_DIR) $@

$(OGG_OPUS_WORKER): $(OGG_OPUS_JS) $(OPUS_OBJ) $(OGG_OBJ) $(SPEEX_OBJ) $(DIST_DIR)
	emcc -o $@ $(EMCC_OPTS) -g3 -s \
		EXPORTED_FUNCTIONS="[$(DEFAULT_EXPORTS),$(OPUS_EXPORTS),$(SPEEX_EXPORTS)]" \
		--pre-js $< $(OPUS_OBJ) $(SPEEX_OBJ)

# etc.
clean:
	make -C $(LIB_DIR) clean
	-rm -rf $(BUILD_DIR) $(DIST_DIR)
