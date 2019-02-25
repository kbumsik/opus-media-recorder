# # Building process
# 	1. Compile C/C++ codes and libraries using Emscripten.
#   2. Packing JS files as UMD using webpack.docs
#   3. Copy files to $(DIST)

# Change the port you like. You can run the dev server by using "make run"
DEV_SERVER_PORT := 9000
# Used by build-docs target
ifdef PRODUCTION
	export BASE_URL := https://cdn.jsdelivr.net/npm/opus-media-recorder@latest
else
	export BASE_URL := https://localhost:$(DEV_SERVER_PORT)
endif

# Path Settings
LIB_DIR := $(abspath lib)
SRC_DIR := $(abspath src)
EXAMPLE_DIR := $(abspath example)
DOCS_DIR := $(abspath docs)
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
all: check_emcc $(FINAL_TARGETS_BUILD) $(FINAL_TARGETS_DIST) build-docs
else
all: check_emcc $(FINAL_TARGETS_BUILD) build-docs
endif

################################################################################
# 1. Emscripten compilation
################################################################################
# Reference: https://github.com/kripken/emscripten/blob/master/src/settings.js

# Emscripten compiler (emcc) options
export EMCC_DEBUG=1
EMCC_OPTS = -std=c++11 \
			-DNDEBUG \
			-fno-exceptions \
			-Oz \
			--llvm-opts 3 \
			--llvm-lto 1 \
			-s WASM=1 \
			-s MODULARIZE=1 \
			-s FILESYSTEM=0 \
			-s MALLOC="emmalloc" \
			--source-map-base http://localhost:$(DEV_SERVER_PORT)/
			# -s EXPORT_ES6=1 -- I'm not using ES6 import yet.
			# -s ENVIRONMENT='worker' -- Enabling it will delete node.js
			#							 codes like require('fs') needed by
			#							 some dunblers like browserify.
			# -s "BINARYEN_METHOD='asmjs,native-wasm'" -- In case we need asm.js
			# --closure 1 -- Gets error
			# -s DYNAMIC_EXECUTION=0 -- Seems to be only for asm.js

DEFAULT_EXPORTS:='_malloc','_free'
OPUS_EXPORTS:='_opus_encoder_create', \
				'_opus_encode_float', \
				'_opus_encoder_ctl', \
				'_opus_encoder_destroy'
SPEEX_EXPORTS:='_speex_resampler_init', \
				'_speex_resampler_process_interleaved_float', \
				'_speex_resampler_destroy'

# WebIDL
WEBIDL = Container.webidl
WEBIDL_GLUE_BASE = $(addsuffix _glue,$(addprefix $(LIB_BUILD_DIR)/,$(WEBIDL)))
WEBIDL_GLUE_JS = $(addsuffix .js,$(WEBIDL_GLUE_BASE))

# OGG/WebM Common
EMCC_INCLUDE_DIR = $(SRC_DIR) \
					$(LIB_DIR)/ogg/include \
					$(LIB_DIR)/webm \
					$(LIB_BUILD_DIR) \
					./

# Emscripten options for Debugging
ifndef PRODUCTION
	EMCC_OPTS +=	-g4 \
					-s EXCEPTION_DEBUG=1 \
					-s ASSERTIONS=2 \
					-s STACK_OVERFLOW_CHECK=1 \
					-s VERBOSE=1 \
					-s DETERMINISTIC=1 \
					-s RUNTIME_LOGGING=1 \
					-s ALLOW_MEMORY_GROWTH=1
				 	# -s DISABLE_EXCEPTION_CATCHING=0 \
					# -s "TOTAL_STACK=5*1024*1024"
					# -s "TOTAL_MEMORY=16777216"
	EMCC_OPTS := $(filter-out -DNDEBUG,$(EMCC_OPTS))
endif

# C compiled static libraries
export OPUS_OBJ = $(LIB_BUILD_DIR)/libopus.a
export OGG_OBJ = $(LIB_BUILD_DIR)/libogg.a
export SPEEX_OBJ = $(LIB_BUILD_DIR)/libspeexdsp.a
export WEBM_OBJ = $(LIB_BUILD_DIR)/libwebm.a
LIB_OBJS = $(OPUS_OBJ) $(OGG_OBJ) $(SPEEX_OBJ) $(WEBM_OBJ)

###########
# Targets #
###########

# 1.1 Static library targets
$(LIB_OBJS):
	make -C $(LIB_DIR) $@

# 1.2 C++ - WebIDL - JavaScript glue code targets
$(WEBIDL_GLUE_JS): $(addprefix $(SRC_DIR)/,$(WEBIDL)) $(LIB_BUILD_DIR)
	python $(EMSCRIPTEN)/tools/webidl_binder.py \
		$< \
		$(WEBIDL_GLUE_BASE)

# $(BUILD_DIR)/OggOpusEncoder.js
# $(BUILD_DIR)/WebMOpusEncoder.js
$(BUILD_DIR)/%OpusEncoder.js $(BUILD_DIR)/%OpusEncoder.wasm $(BUILD_DIR)/%OpusEncoder.wasm.map: $(SRC_DIR)/%Container.cpp $(SRC_DIR)/%Container_webidl_js_binder.cpp $(SRC_DIR)/%Container.hpp $(SRC_DIR)/OpusEncoder.js $(WEBIDL_GLUE_JS) $(SRC_DIR)/ContainerInterface.cpp $(LIB_OBJS)
	emcc -o $@ \
		$(EMCC_OPTS) \
		-s EXPORTED_FUNCTIONS="[$(DEFAULT_EXPORTS),$(OPUS_EXPORTS),$(SPEEX_EXPORTS)]" \
		$(addprefix -I,$(EMCC_INCLUDE_DIR)) \
		$(word 1,$^) \
		$(word 2,$^) \
		$(SRC_DIR)/ContainerInterface.cpp \
		$(LIB_OBJS) \
		--pre-js $(SRC_DIR)/OpusEncoder.js \
		--post-js $(WEBIDL_GLUE_JS)

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

.PHONY : all check_emcc serve build-docs clean-lib clean-js clean

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

build-docs:
	OUTPUT_DIR=$(DOCS_DIR) make -C $(EXAMPLE_DIR)/example_template
	OUTPUT_DIR=$(EXAMPLE_DIR)/webpack make -C $(EXAMPLE_DIR)/example_template

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
