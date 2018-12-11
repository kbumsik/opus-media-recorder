LIB_DIR = ./lib
SRC_DIR = ./src
export BUILD_DIR = $(abspath ./build)
DIST_DIR = ./dist
DOCS_DIR = ./docs

# For Emscripten
# Reference: https://github.com/kripken/emscripten/blob/master/src/settings.js
EMCC_OPTS = -g4 \
			-Oz \
			--llvm-lto 1 \
			-s WASM=1 \
			-s DETERMINISTIC=1 \
			-s "BINARYEN_METHOD='native-wasm'" \
			-s FILESYSTEM=0 \
			-s NO_DYNAMIC_EXECUTION=1 \
			-s ENVIRONMENT='worker' \
			--closure 1 \
			-s MALLOC="emmalloc" \
			-s DISABLE_EXCEPTION_CATCHING=0 \
			# -s MODULARIZE=1 \

DEFAULT_EXPORTS:='_malloc','_free'
OPUS_EXPORTS:='_opus_encoder_create','_opus_encode_float','_opus_encoder_ctl', \
				'_opus_encoder_destroy'
SPEEX_EXPORTS:='_speex_resampler_init','_speex_resampler_process_interleaved_float', \
				'_speex_resampler_destroy'

WEBIDL = OggContainer.webidl
WEBIDL_GLUE_BASE = $(addsuffix _glue,$(addprefix $(BUILD_DIR)/,$(WEBIDL)))
WEBIDL_GLUE_JS = $(addsuffix .js,$(WEBIDL_GLUE_BASE))
SRC = $(SRC_DIR)/OggContainer.cpp \
		$(SRC_DIR)/cpp_webidl_js_binder.cpp
INCLUDE = $(SRC_DIR)/OggContainer.hpp
INCLUDE_DIR = $(SRC_DIR) \
				$(LIB_DIR)/ogg/include \
				$(LIB_DIR)/webm \
				$(BUILD_DIR)

# For JavaScript build
NPM_BUILD_CMD = build

# Options for production
ifdef PRODUCTION
	EMCC_OPTS := $(filter-out -g3, $(EMCC_OPTS))
	EMCC_OPTS := $(filter-out "-s DETERMINISTIC=1", $(EMCC_OPTS))
	NPM_BUILD_CMD = build:production
endif

# C compiled static libraries
export OPUS_OBJ = $(BUILD_DIR)/libopus.a
export OGG_OBJ = $(BUILD_DIR)/libogg.a
export SPEEX_OBJ = $(BUILD_DIR)/libspeexdsp.a
export WEBM_OBJ = $(BUILD_DIR)/libwebm.a
OBJS = $(OPUS_OBJ) $(OGG_OBJ) $(SPEEX_OBJ) $(WEBM_OBJ)

# JavaScript intermediate builds
OGG_OPUS_JS = $(BUILD_DIR)/OggOpusWorker.js

# Final targets
OGG_OPUS_WORKER = $(DIST_DIR)/OggOpusWorker.js
OUTPUT_FILES = MediaRecorder.js OggOpusWorker.js OggOpusWorker.wasm WaveWorker.js

# Assets in docs folder
DOCS_ASSETS = $(addprefix $(DOCS_DIR)/assets/, $(OUTPUT_FILES))

.PHONY: all run clean

all: $(OGG_OPUS_WORKER) $(DOCS_ASSETS)

$(DIST_DIR) $(BUILD_DIR):
	mkdir $@

# Building libraries
$(BUILD_DIR)/%.js $(DIST_DIR)/%.js: $(SRC_DIR)/%.js
	npm run $(NPM_BUILD_CMD)

$(BUILD_DIR)/%.a:
	make -C $(LIB_DIR) $@

$(WEBIDL_GLUE_JS): $(addprefix $(SRC_DIR)/,$(WEBIDL)) $(BUILD_DIR)
	python $(EMSCRIPTEN)/tools/webidl_binder.py \
		$< \
		$(WEBIDL_GLUE_BASE)

$(OGG_OPUS_WORKER): $(OGG_OPUS_JS) $(WEBIDL_GLUE_JS) $(SRC) $(INCLUDE) $(OBJS) $(DIST_DIR)
	emcc -o $@ \
		$(EMCC_OPTS) \
		-s EXPORTED_FUNCTIONS="[$(DEFAULT_EXPORTS),$(OPUS_EXPORTS),$(SPEEX_EXPORTS)]" \
		$(addprefix -I,$(INCLUDE_DIR)) \
		$(SRC) \
		$(OBJS) \
		--pre-js $< \
		--post-js $(WEBIDL_GLUE_JS)

$(DOCS_DIR)/assets/%: $(DIST_DIR)/%
	cp $< $@

# etc.
run:
	npm run start

clean:
	make -C $(LIB_DIR) clean
	-rm -rf $(BUILD_DIR) $(DIST_DIR) WebIDLGrammar.pkl parser.out
