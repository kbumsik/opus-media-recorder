OPUS_DIR = ./opus
OGG_DIR = ./ogg
SPEEX_DIR = ./speexdsp

OPUS_OBJ ?= $(OPUS_DIR)/.libs/libopus.a

OGG_OBJ ?= $(OGG_DIR)/src/.libs/libogg.a

SPEEX_OBJ ?= $(SPEEX_DIR)/libspeexdsp/.libs/libspeexdsp.a


.PHONY: all clean

all: $(OPUS_OBJ) $(OGG_OBJ) $(SPEEX_OBJ)

$(addsuffix /autogen.sh, $(OPUS_DIR) $(OGG_DIR) $(SPEEX_DIR)):
	git submodule update --init --recursive

## libopus
$(OPUS_OBJ): $(OPUS_DIR) $(OPUS_DIR)/autogen.sh
	cd $< && ./autogen.sh
	cd $< && emconfigure ./configure --disable-extra-programs \
					--disable-doc --disable-intrinsics --disable-rtcd
	emmake make -C $<

## libogg
$(OGG_OBJ): $(OGG_DIR) $(OGG_DIR)/autogen.sh
	cd $< && ./autogen.sh
	cd $< && emconfigure ./configure --disable-extra-programs \
					--disable-doc --disable-intrinsics --disable-rtcd
	emmake make -C $<

## SpeexDSP
$(SPEEX_OBJ): $(SPEEX_DIR) $(SPEEX_DIR)/autogen.sh
	cd $< && ./autogen.sh
	cd $< && emconfigure ./configure --disable-examples
	emmake make -C $<

## etc.
clean:
	cd $(OPUS_DIR) && git reset --hard HEAD && git clean -fdx
	cd $(OGG_DIR) && git reset --hard HEAD && git clean -fdx
	cd $(SPEEX_DIR) && git reset --hard HEAD && git clean -fdx
