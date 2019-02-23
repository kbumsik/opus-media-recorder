BASE_URL ?= https://localhost
OUTPUT_DIR ?= dist

TARGETS = \
	$(OUTPUT_DIR)/index.html \
	$(OUTPUT_DIR)/example.js \
	$(OUTPUT_DIR)/main.css \
	$(OUTPUT_DIR)/octocat.css

all: node_modules $(TARGETS)

$(OUTPUT_DIR)/index.html $(OUTPUT_DIR)/example.js: index.html example.js
	npm run build

$(OUTPUT_DIR)/%.css: %.css
	cp $< $@

node_modules:
	npm install

.PHONY: all $(OUTPUT_DIR)/index.html
