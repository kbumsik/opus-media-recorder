OPUS_DIR = ./opus
OGG_DIR = ./ogg

OPUS_OBJ ?= $(OPUS_DIR)/.libs/libopus.a

OGG_OBJ ?= $(OGG_DIR)/src/.libs/libogg.a

$(addsuffix /autogen.sh, $(OPUS_DIR) $(OGG_DIR)):
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

## etc.
.PHONY: clean

clean:
	cd $(OPUS_DIR) && git reset --hard HEAD && git clean -fdx
	cd $(OGG_DIR) && git reset --hard HEAD && git clean -fdx
