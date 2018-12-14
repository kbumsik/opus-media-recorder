# # Building process
# 	1. Compile Emscripten-related (WebAssembly) files into /build/emscripten
#   2. Compile Web Worker JS files to /build, using webpack.
#	3. Compile MediaRecorder.js to /build, also using webpack.
#   4. Copy example files (/docs/index.html) to /build, for test running.
#   5. If PRODUCTION is set, copy them to /dist and /docs

# Change the port you like. You can run the dev server by using "make run"
DEV_SERVER_PORT := 9000

LIB_DIR := lib
SRC_DIR := src
# This is used by /lib/Makefile
export BUILD_DIR := $(abspath build)
export LIB_BUILD_DIR := $(abspath $(BUILD_DIR)/emscripten)
DIST_DIR := dist
DOCS_DIR := docs

# Expected files
OUTPUT_FILES = MediaRecorder.js WaveWorker.js \
				OggOpusWorker.js OggOpusWorker.wasm \
				WebMOpusWorker.js WebMOpusWorker.wasm
ifndef PRODUCTION
	# Debugging map files
	OUTPUT_FILES += OggOpusWorker.wasm.map WebMOpusWorker.wasm.map
endif

FINAL_TARGETS_BUILD = $(addprefix $(BUILD_DIR)/,$(OUTPUT_FILES))
ifdef PRODUCTION
	FINAL_TARGETS_DIST = $(addprefix $(DIST_DIR)/,$(OUTPUT_FILES))
	FINAL_TARGETS_DOCS = $(addprefix $(DOCS_DIR)/,$(OUTPUT_FILES))
endif

# This is the final targets, what "make" command builds
all : $(FINAL_TARGETS_BUILD) $(FINAL_TARGETS_DIST) $(FINAL_TARGETS_DOCS)

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
			-s "BINARYEN_METHOD='native-wasm'" \
			-s FILESYSTEM=0 \
			-s NO_DYNAMIC_EXECUTION=1 \
			-s ENVIRONMENT='worker' \
			-s MALLOC="emmalloc" \
			-s DISABLE_EXCEPTION_CATCHING=0 \
			--source-map-base http://localhost:$(DEV_SERVER_PORT)/
			# --closure 1
			# -s MODULARIZE=1

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
EMCC_OGG_OPUS_JS = $(LIB_BUILD_DIR)/OggOpusWorker.js
EMCC_WEBM_OPUS_JS = $(LIB_BUILD_DIR)/WebMOpusWorker.js

# emcc target source files
SRC_OGG_OPUS_JS = $(SRC_DIR)/OggOpusWorker.js
SRC_WEBM_OPUS_JS = $(SRC_DIR)/WebMOpusWorker.js

###########
# Targets #
###########

# 1.1 Static library targets
$(OBJS) :
	make -C $(LIB_DIR) $@

# 1.2 C++ - WebIDL - JavaScript glue code targets
$(OGG_WEBIDL_GLUE_JS) : $(addprefix $(SRC_DIR)/,$(OGG_WEBIDL)) $(LIB_BUILD_DIR)
	python $(EMSCRIPTEN)/tools/webidl_binder.py \
		$< \
		$(OGG_WEBIDL_GLUE_BASE)

$(WEBM_WEBIDL_GLUE_JS) : $(addprefix $(SRC_DIR)/,$(WEBM_WEBIDL)) $(LIB_BUILD_DIR)
	python $(EMSCRIPTEN)/tools/webidl_binder.py \
		$< \
		$(WEBM_WEBIDL_GLUE_BASE)

# 1.3 Compile using emcc
$(EMCC_OGG_OPUS_JS): $(SRC_OGG_OPUS_JS) $(OGG_WEBIDL_GLUE_JS) $(OGG_OPUS_SRC) $(OGG_OPUS_INCLUDE) $(OBJS)
	emcc -o $@ \
		$(EMCC_OPTS) \
		-s EXPORTED_FUNCTIONS="[$(DEFAULT_EXPORTS),$(OPUS_EXPORTS),$(SPEEX_EXPORTS)]" \
		$(addprefix -I,$(EMCC_INCLUDE_DIR)) \
		$(OGG_OPUS_SRC) \
		$(OBJS) \
		--pre-js $< \
		--post-js $(word 2,$^)

$(EMCC_WEBM_OPUS_JS): $(SRC_WEBM_OPUS_JS) $(WEBM_WEBIDL_GLUE_JS) $(WEBM_OPUS_SRC) $(WEBM_INCLUDE) $(OBJS)
	emcc -o $@ \
		$(EMCC_OPTS) \
		-s EXPORTED_FUNCTIONS="[$(DEFAULT_EXPORTS),$(OPUS_EXPORTS),$(SPEEX_EXPORTS)]" \
		$(addprefix -I,$(EMCC_INCLUDE_DIR)) \
		$(WEBM_OPUS_SRC) \
		$(OBJS) \
		--pre-js $< \
		--post-js $(word 2,$^)


################################################################################
# 2. Web Workers compilation using webpack
################################################################################
# For JavaScript build
NPM_FLAGS = -d

# Options for production
ifdef PRODUCTION
	NPM_FLAGS := $(filter-out -d,$(NPM_FLAGS))
	NPM_FLAGS += -p
endif

# Web Workers
OGG_OPUS_WORKER_JS = $(BUILD_DIR)/OggOpusWorker.js
WEBM_OPUS_WORKER_JS = $(BUILD_DIR)/WebMOpusWorker.js
WAVE_WORKER_JS = $(BUILD_DIR)/WaveWorker.js
WORKERS_JS = $(OGG_OPUS_WORKER_JS) $(WEBM_OPUS_WORKER_JS) $(WAVE_WORKER_JS)

# 2.1 Copy extra JS files to /build/emscripten
$(LIB_BUILD_DIR)/commonFunctions.js : $(SRC_DIR)/commonFunctions.js
	cp $< $@

# 2.2 Build Web Workers to /build
$(OGG_OPUS_WORKER_JS) : $(LIB_BUILD_DIR)/OggOpusWorker.js $(LIB_BUILD_DIR)/commonFunctions.js
	npm run webpack -- --config webpack.workers.config.js \
						$(NPM_FLAGS) \
						$< \
						-o $@

$(WEBM_OPUS_WORKER_JS) : $(LIB_BUILD_DIR)/WebMOpusWorker.js $(LIB_BUILD_DIR)/commonFunctions.js
	npm run webpack -- --config webpack.workers.config.js \
						$(NPM_FLAGS) \
						$< \
						-o $@

$(WAVE_WORKER_JS) : $(SRC_DIR)/WaveWorker.js $(LIB_BUILD_DIR)/commonFunctions.js
	npm run webpack -- --config webpack.workers.config.js \
						$(NPM_FLAGS) \
						$< \
						-o $@

################################################################################
# 3. MediaRecorder.js compilation using webpack.
################################################################################

$(BUILD_DIR)/MediaRecorder.js : $(SRC_DIR)/MediaRecorder.js $(WORKERS_JS)
	npm run webpack -- --config webpack.config.js \
						$(NPM_FLAGS) \
						--output-library MediaRecorder \
						--output-library-target umd \
						$< \
						-o $@

$(BUILD_DIR)/%.wasm: $(LIB_BUILD_DIR)/%.wasm
	cp $< $@

$(BUILD_DIR)/%.wasm.map: $(LIB_BUILD_DIR)/%.wasm.map
	cp $< $@

################################################################################
# 4 and 5. Production files
################################################################################

$(FINAL_TARGETS_DIST) $(FINAL_TARGETS_DOCS): $(FINAL_TARGETS_BUILD)
	cp $(BUILD_DIR)/$(notdir $@) $@

################################################################################
# Development settings
################################################################################
# Development server setting
DOCS_FILES = debuggingHelper.js example.js index.html

$(addprefix $(BUILD_DIR)/, $(DOCS_FILES)): $(addprefix $(DOCS_DIR)/, $(DOCS_FILES))
	cp $(DOCS_DIR)/$(notdir $@) $@ 

all: $(addprefix $(BUILD_DIR)/, $(DOCS_FILES))

################################################################################
# etc.
################################################################################

.PHONY : all run clean

$(BUILD_DIR) $(LIB_BUILD_DIR):
	mkdir -p $@

run: all
	npm start -- --port $(DEV_SERVER_PORT)

clean :
	make -C $(LIB_DIR) clean
	-rm -rf $(BUILD_DIR) $(DIST_DIR) WebIDLGrammar.pkl parser.out
