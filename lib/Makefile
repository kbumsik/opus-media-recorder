BUILD_DIR ?= ./build # This can be overritten by ../Makefile
OPUS_DIR = ./opus
OGG_DIR = ./ogg
SPEEX_DIR = ./speexdsp

OPUS_OBJ_LIB = $(OPUS_DIR)/.libs/libopus.a
OPUS_OBJ ?= $(BUILD_DIR)/libopus.a

OGG_OBJ_LIB = $(OGG_DIR)/src/.libs/libogg.a
OGG_OBJ ?= $(BUILD_DIR)/libogg.a

SPEEX_OBJ_LIB = $(SPEEX_DIR)/libspeexdsp/.libs/libspeexdsp.a
SPEEX_OBJ ?= $(BUILD_DIR)/libspeexdsp.a

.PHONY: all clean

all: $(OPUS_OBJ) $(OGG_OBJ) $(SPEEX_OBJ)

$(addsuffix /autogen.sh, $(OPUS_DIR) $(OGG_DIR) $(SPEEX_DIR)):
	git submodule update --init --recursive

$(BUILD_DIR):
	mkdir $@

## libopus
$(OPUS_OBJ_LIB): $(OPUS_DIR) $(OPUS_DIR)/autogen.sh
	cd $< && ./autogen.sh
	cd $< && emconfigure ./configure --disable-extra-programs \
					--disable-doc --disable-intrinsics --disable-rtcd
	emmake make -C $<

$(OPUS_OBJ): $(OPUS_OBJ_LIB) $(BUILD_DIR)
	cp $< $@

## libogg
$(OGG_OBJ_LIB): $(OGG_DIR) $(OGG_DIR)/autogen.sh
	cd $< && ./autogen.sh
	cd $< && emconfigure ./configure --disable-extra-programs \
					--disable-doc --disable-intrinsics --disable-rtcd
	emmake make -C $<

$(OGG_OBJ): $(OGG_OBJ_LIB) $(BUILD_DIR)
	cp $< $@

## SpeexDSP
$(SPEEX_OBJ_LIB): $(SPEEX_DIR) $(SPEEX_DIR)/autogen.sh
	cd $< && ./autogen.sh
	cd $< && emconfigure ./configure --disable-examples
	emmake make -C $<

$(SPEEX_OBJ): $(SPEEX_OBJ_LIB) $(BUILD_DIR)
	cp $< $@

## etc.
clean:
	cd $(OPUS_DIR) && git reset --hard HEAD && git clean -fdx
	cd $(OGG_DIR) && git reset --hard HEAD && git clean -fdx
	cd $(SPEEX_DIR) && git reset --hard HEAD && git clean -fdx
	-rm $(OPUS_OBJ) $(OGG_OBJ) $(SPEEX_OBJ)
