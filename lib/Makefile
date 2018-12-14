BUILD_DIR ?= build
# This can be overritten by ../Makefile
LIB_BUILD_DIR ?= $(BUILD_DIR)/emscripten
OPUS_DIR := opus
OGG_DIR := ogg
SPEEX_DIR := speexdsp
WEBM_DIR := webm

OPUS_OBJ_LIB = $(OPUS_DIR)/.libs/libopus.a
OPUS_OBJ ?= $(LIB_BUILD_DIR)/libopus.a

OGG_OBJ_LIB = $(OGG_DIR)/src/.libs/libogg.a
OGG_OBJ ?= $(LIB_BUILD_DIR)/libogg.a

SPEEX_OBJ_LIB = $(SPEEX_DIR)/libspeexdsp/.libs/libspeexdsp.a
SPEEX_OBJ ?= $(LIB_BUILD_DIR)/libspeexdsp.a

WEBM_OBJ_LIB = $(WEBM_DIR)/libwebm.a
WEBM_OBJ ?= $(LIB_BUILD_DIR)/libwebm.a

.PHONY: all clean

all: $(OPUS_OBJ) $(OGG_OBJ) $(SPEEX_OBJ) $(WEBM_OBJ)

$(BUILD_DIR) $(LIB_BUILD_DIR):
	mkdir -p $@

$(addsuffix /autogen.sh, $(OPUS_DIR) $(OGG_DIR) $(SPEEX_DIR)) $(WEBM_DIR)/CMakeLists.txt:
	git submodule update --init --recursive

## libopus
$(OPUS_OBJ_LIB): $(OPUS_DIR) $(OPUS_DIR)/autogen.sh
	cd $< && ./autogen.sh
	cd $< && emconfigure ./configure \
							--disable-extra-programs \
							--disable-doc \
							--disable-intrinsics \
							--disable-rtcd \
							--disable-asm
	emmake make -C $<

$(OPUS_OBJ): $(OPUS_OBJ_LIB) $(LIB_BUILD_DIR)
	cp $< $@

## libogg
$(OGG_OBJ_LIB): $(OGG_DIR) $(OGG_DIR)/autogen.sh
	cd $< && ./autogen.sh
	cd $< && emconfigure ./configure
	emmake make -C $<

$(OGG_OBJ): $(OGG_OBJ_LIB) $(LIB_BUILD_DIR)
	cp $< $@

## SpeexDSP
$(SPEEX_OBJ_LIB): $(SPEEX_DIR) $(SPEEX_DIR)/autogen.sh
	cd $< && ./autogen.sh
	cd $< && emconfigure ./configure \
							--disable-examples
	emmake make -C $<

$(SPEEX_OBJ): $(SPEEX_OBJ_LIB) $(LIB_BUILD_DIR)
	cp $< $@

# libwebm
$(WEBM_OBJ_LIB): $(WEBM_DIR)
	cd $< && emconfigure cmake . \
							-DCMAKE_BUILD_TYPE=release \
							-DCMAKE_CXX_FLAGS="-MMD -MP"
	emmake make -C $<

$(WEBM_OBJ): $(WEBM_OBJ_LIB) $(LIB_BUILD_DIR)
	cp $< $@

## etc.
clean:
	cd $(OPUS_DIR) && git reset --hard HEAD && git clean -fdx
	cd $(OGG_DIR) && git reset --hard HEAD && git clean -fdx
	cd $(SPEEX_DIR) && git reset --hard HEAD && git clean -fdx
	cd $(WEBM_DIR) && git reset --hard HEAD && git clean -fdx
	-rm $(OPUS_OBJ) $(OGG_OBJ) $(SPEEX_OBJ) $(WEBM_DIR)
