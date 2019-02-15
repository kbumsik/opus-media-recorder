# # Building process
# 	1. Compile C/C++ codes and libraries using Emscripten.
#   2. Packing JS files as UMD using webpack.docs
#   3. Copy files to $(DIST)

# Change the port you like. You can run the dev server by using "make run"
DEV_SERVER_PORT := 9000

# Path Settings
LIB_DIR := lib
SRC_DIR := src
# This is used by /lib/Makefile
export BUILD_DIR := $(abspath build)
export LIB_BUILD_DIR := $(abspath $(BUILD_DIR)/emscripten)
DIST_DIR := .

# Expected files
OUTPUT_FILES = OpusMediaRecorder.js WaveEncoder.js \
				OggOpusEncoder.js OggOpusEncoder.wasm \
				WebMOpusEncoder.js WebMOpusEncoder.wasm \
				encoderWorker.js commonFunctions.js

# Add UMD libraries
OUTPUT_FILES += OpusMediaRecorder.umd.js encoderWorker.umd.js

FINAL_TARGETS_BUILD = $(addprefix $(BUILD_DIR)/,$(OUTPUT_FILES))

# Production only section
# .bin files - Some bundlers needs extension other than .wasm
OUTPUT_FILES_WASM := $(filter %.wasm, $(OUTPUT_FILES))
OUTPUT_FILES_BIN = $(OUTPUT_FILES_WASM:%.wasm=%.bin)
# Production only files: dist
FINAL_TARGETS_DIST = $(addprefix $(DIST_DIR)/,$(OUTPUT_FILES) $(OUTPUT_FILES_BIN))

ifndef PRODUCTION
	# Development only section
	# Debugging map files
	OUTPUT_FILES += OggOpusEncoder.wasm.map WebMOpusEncoder.wasm.map
endif

ifdef PRODUCTION
all: check_emcc $(FINAL_TARGETS_BUILD) $(FINAL_TARGETS_DIST)
else
all: check_emcc $(FINAL_TARGETS_BUILD)
endif

################################################################################
# 1. Emscripten compilation
################################################################################
# Reference: https://github.com/kripken/emscripten/blob/master/src/settings.js

# Emscripten compiler (emcc) options
EMCC_OPTS = -g4 \
			-O1 \
			--llvm-lto 1 \
			-s WASM=1 \
			-s DETERMINISTIC=1 \
			-s FILESYSTEM=0 \
			-s NO_DYNAMIC_EXECUTION=1 \
			-s ENVIRONMENT='worker' \
			-s MALLOC="emmalloc" \
			-s DISABLE_EXCEPTION_CATCHING=0 \
			--source-map-base http://localhost:$(DEV_SERVER_PORT)/ \
			-s MODULARIZE=1
			# -s "BINARYEN_METHOD='native-wasm'" \
			# --closure 1

DEFAULT_EXPORTS:='_malloc','_free'
OPUS_EXPORTS:='_opus_encoder_create', \
				'_opus_encode_float', \
				'_opus_encoder_ctl', \
				'_opus_encoder_destroy'
SPEEX_EXPORTS:='_speex_resampler_init', \
				'_speex_resampler_process_interleaved_float', \
				'_speex_resampler_destroy'

# OggOpus targets
OGG_WEBIDL = OggContainer.webidl
OGG_WEBIDL_GLUE_BASE = $(addsuffix _glue,$(addprefix $(LIB_BUILD_DIR)/,$(OGG_WEBIDL)))
# build/emscripten/%.webidl_glue.js
OGG_WEBIDL_GLUE_JS = $(addsuffix .js,$(OGG_WEBIDL_GLUE_BASE))
OGG_OPUS_SRC = $(SRC_DIR)/OggContainer.cpp \
				$(SRC_DIR)/oggcontainer_webidl_js_binder.cpp
OGG_OPUS_INCLUDE = $(SRC_DIR)/OggContainer.hpp

# WebMOpus targets
WEBM_WEBIDL = WebMContainer.webidl
WEBM_WEBIDL_GLUE_BASE = $(addsuffix _glue,$(addprefix $(LIB_BUILD_DIR)/,$(WEBM_WEBIDL)))
WEBM_WEBIDL_GLUE_JS = $(addsuffix .js,$(WEBM_WEBIDL_GLUE_BASE))
WEBM_OPUS_SRC = $(SRC_DIR)/WebMContainer.cpp \
				$(SRC_DIR)/webmcontainer_webidl_js_binder.cpp
WEBM_INCLUDE = $(SRC_DIR)/WebMContainer.hpp

# OGG/WebM Common
EMCC_INCLUDE_DIR = $(SRC_DIR) \
					$(LIB_DIR)/ogg/include \
					$(LIB_DIR)/webm \
					$(LIB_BUILD_DIR) \
					./

# Emscripten options for production
ifdef PRODUCTION
	EMCC_OPTS := $(filter-out -g4,$(EMCC_OPTS))
	EMCC_OPTS := $(filter-out "-s DETERMINISTIC=1",$(EMCC_OPTS))
endif

# C compiled static libraries
export OPUS_OBJ = $(LIB_BUILD_DIR)/libopus.a
export OGG_OBJ = $(LIB_BUILD_DIR)/libogg.a
export SPEEX_OBJ = $(LIB_BUILD_DIR)/libspeexdsp.a
export WEBM_OBJ = $(LIB_BUILD_DIR)/libwebm.a
OBJS = $(OPUS_OBJ) $(OGG_OBJ) $(SPEEX_OBJ) $(WEBM_OBJ)

# emcc targets
EMCC_OGG_OPUS_JS = $(BUILD_DIR)/OggOpusEncoder.js
EMCC_WEBM_OPUS_JS = $(BUILD_DIR)/WebMOpusEncoder.js

# emcc target source files
SRC_OGG_OPUS_JS = $(SRC_DIR)/OggOpusEncoder.js
SRC_WEBM_OPUS_JS = $(SRC_DIR)/WebMOpusEncoder.js

###########
# Targets #
###########

# 1.1 Static library targets
$(OBJS):
	make -C $(LIB_DIR) $@

# 1.2 C++ - WebIDL - JavaScript glue code targets
$(OGG_WEBIDL_GLUE_JS): $(addprefix $(SRC_DIR)/,$(OGG_WEBIDL)) $(LIB_BUILD_DIR)
	python $(EMSCRIPTEN)/tools/webidl_binder.py \
		$< \
		$(OGG_WEBIDL_GLUE_BASE)

$(WEBM_WEBIDL_GLUE_JS): $(addprefix $(SRC_DIR)/,$(WEBM_WEBIDL)) $(LIB_BUILD_DIR)
	python $(EMSCRIPTEN)/tools/webidl_binder.py \
		$< \
		$(WEBM_WEBIDL_GLUE_BASE)

# 1.3 Compile using emcc
$(EMCC_OGG_OPUS_JS) $(EMCC_OGG_OPUS_JS:%.js=%.wasm) $(EMCC_OGG_OPUS_JS:%.js=%.wasm.map): $(SRC_OGG_OPUS_JS) $(OGG_WEBIDL_GLUE_JS) $(OGG_OPUS_SRC) $(OGG_OPUS_INCLUDE) $(OBJS)
	emcc -o $(EMCC_OGG_OPUS_JS) \
		$(EMCC_OPTS) \
		-s EXPORTED_FUNCTIONS="[$(DEFAULT_EXPORTS),$(OPUS_EXPORTS),$(SPEEX_EXPORTS)]" \
		$(addprefix -I,$(EMCC_INCLUDE_DIR)) \
		$(OGG_OPUS_SRC) \
		$(OBJS) \
		--pre-js $< \
		--post-js $(word 2,$^)

$(EMCC_WEBM_OPUS_JS) $(EMCC_WEBM_OPUS_JS:%.js=%.wasm) $(EMCC_WEBM_OPUS_JS:%.js=%.wasm.map): $(SRC_WEBM_OPUS_JS) $(WEBM_WEBIDL_GLUE_JS) $(WEBM_OPUS_SRC) $(WEBM_INCLUDE) $(OBJS)
	emcc -o $(EMCC_WEBM_OPUS_JS) \
		$(EMCC_OPTS) \
		-s EXPORTED_FUNCTIONS="[$(DEFAULT_EXPORTS),$(OPUS_EXPORTS),$(SPEEX_EXPORTS)]" \
		$(addprefix -I,$(EMCC_INCLUDE_DIR)) \
		$(WEBM_OPUS_SRC) \
		$(OBJS) \
		--pre-js $< \
		--post-js $(word 2,$^)


################################################################################
# 2. UMD compilation using webpack
################################################################################
# For JavaScript build
NPM_FLAGS = -d

# Options for production
ifdef PRODUCTION
	NPM_FLAGS := $(filter-out -d,$(NPM_FLAGS))
	NPM_FLAGS += -p
endif

# 2.1 Copy extra JS files to /build/emscripten
$(BUILD_DIR)/%.js: $(SRC_DIR)/%.js $(BUILD_DIR)
	cp $< $@

# 2.2 UMD library
$(BUILD_DIR)/%.umd.js: $(BUILD_DIR)/%.js $(BUILD_DIR)/commonFunctions.js
	npm run webpack -- --config webpack.config.js \
						$(NPM_FLAGS) \
						--output-library $(basename $(notdir $<)) \
						--output-library-target umd \
						$< \
						-o $@

# 2.2 UMD Web Worker
$(BUILD_DIR)/%Worker.umd.js: $(BUILD_DIR)/%Worker.js $(BUILD_DIR)/commonFunctions.js
	npm run webpack -- --config webpack.worker.config.js \
						$(NPM_FLAGS) \
						$< \
						-o $@

################################################################################
# 3. Production files
################################################################################

$(DIST_DIR)/%: $(BUILD_DIR)/%
	cp $< $@

$(DIST_DIR)/%.bin: $(BUILD_DIR)/%.wasm
	cp $< $@

################################################################################
# etc.
################################################################################

.PHONY : all check_emcc run clean-lib clean-js clean

ifndef EMSCRIPTEN
  $(error EMSCRIPTEN is undefined. Enable Escripten SDK.)
endif

cc_version = $(shell $(1) --version | head -n1 | cut -d" " -f5)

define check_version
	@if test "$$(printf '%s\n' "$(1)" "$(2)" | sort -V | head -n 1)" != "$(1)"; then \
		exit 0; \
	else \
		echo $(3); \
		exit 1; \
	fi
endef

check_emcc:
	@which emcc > /dev/null
	@echo Building with emcc version: $(call cc_version, emcc)
	$(call check_version, $(call cc_version, emcc), 1.38.24, 'emcc(emscripten) version must be 1.38.25 or higher')

$(BUILD_DIR) $(LIB_BUILD_DIR):
	mkdir -p $@

serve: all
	# Run server
	npm run serve -- --port $(DEV_SERVER_PORT)

clean-lib:
	# Clean /lib
	make -C $(LIB_DIR) clean

clean-js:
	# Delete build files, not touch subdirectory like LIB_BUILD_DIR
	-rm $(BUILD_DIR)/*
	# Delete WebIDL parser outputs
	-rm WebIDLGrammar.pkl parser.out
	# Delete Dist files
	-rm $(FINAL_TARGETS_DIST)

clean: clean-lib clean-js
	# Delete build folder
	-rm -rf $(BUILD_DIR)
