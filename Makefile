LIB_DIR = ./lib

.PHONY: all build-lib clean

all: build-lib

build-lib:
	make -C $(LIB_DIR) all

clean:
	make -C $(LIB_DIR) clean
