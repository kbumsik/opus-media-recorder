LIB_DIR = ./lib
SRC_DIR = ./src
export BUILD_DIR = $(abspath ./build)
DIST_DIR = ./dist
DOCS_DIR = ./docs

# For Emscripten
EMCC_OPTS=-g3 -O3 --llvm-lto 1 -s NO_DYNAMIC_EXECUTION=1 -s NO_FILESYSTEM=1
DEFAULT_EXPORTS:='_malloc','_free'
OPUS_EXPORTS:='_opus_encoder_create','_opus_encode_float','_opus_encoder_ctl', \
				'_opus_encoder_destroy'
SPEEX_EXPORTS:='_speex_resampler_init','_speex_resampler_process_interleaved_float', \
				'_speex_resampler_destroy'

# For JavaScript build
NPM_BUILD_CMD = build

# Options for production
ifdef PRODUCTION
	EMCC_OPTS := $(filter-out -g3, $(EMCC_OPTS))
	EMCC_OPTS += -g0
	NPM_BUILD_CMD = build:production
endif

# C compiled static libraries
export OPUS_OBJ = $(BUILD_DIR)/libopus.a
export OGG_OBJ = $(BUILD_DIR)/libogg.a
export SPEEX_OBJ = $(BUILD_DIR)/libspeexdsp.a

# JavaScript intermediate builds
OGG_OPUS_JS = $(BUILD_DIR)/OggOpusWorker.js

# Final targets
OGG_OPUS_WORKER = $(DIST_DIR)/OggOpusWorker.js
OUTPUT_FILES = MediaRecorder.js OggOpusWorker.js OggOpusWorker.wasm WaveWorker.js

# Assets in docs folder
DOCS_ASSETS = $(addprefix $(DOCS_DIR)/assets/, $(OUTPUT_FILES))

.PHONY: all run clean

all: $(OGG_OPUS_WORKER) $(DOCS_ASSETS)

$(DIST_DIR):
	mkdir $@

# Building libraries
$(BUILD_DIR)/%.js $(DIST_DIR)/%.js: $(SRC_DIR)/%.js
	npm run $(NPM_BUILD_CMD)

$(BUILD_DIR)/%.a:
	make -C $(LIB_DIR) $@

$(OGG_OPUS_WORKER): $(OGG_OPUS_JS) $(OPUS_OBJ) $(OGG_OBJ) $(SPEEX_OBJ) $(DIST_DIR)
	emcc -o $@ $(EMCC_OPTS) \
		-s EXPORTED_FUNCTIONS="[$(DEFAULT_EXPORTS),$(OPUS_EXPORTS),$(SPEEX_EXPORTS)]" \
		--pre-js $< $(OPUS_OBJ) $(SPEEX_OBJ)

$(DOCS_DIR)/assets/%: $(DIST_DIR)/%
	cp $< $@

# etc.
run:
	npm run start

clean:
	make -C $(LIB_DIR) clean
	-rm -rf $(BUILD_DIR) $(DIST_DIR)
