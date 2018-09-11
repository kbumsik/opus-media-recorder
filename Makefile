LIB_DIR = ./lib

export OPUS_OBJ = $(LIB_DIR)/opus/.libs/libopus.a
export OGG_OBJ = $(LIB_DIR)/src/.libs/libogg.a

all: $(OPUS_OBJ) $(OGG_OBJ)

$(OPUS_OBJ) $(OGG_OBJ):
	make -C $(LIB_DIR) $@

clean:
	make -C $(LIB_DIR) clean
