BASE_URL ?= https://localhost
OUTPUT_DIR ?= dist

TARGETS = \
	$(OUTPUT_DIR)/index.html \
	$(OUTPUT_DIR)/example.js \
	$(OUTPUT_DIR)/main.css \
	$(OUTPUT_DIR)/octocat.css

all: $(TARGETS)

$(OUTPUT_DIR)/index.html $(OUTPUT_DIR)/example.js: index.template.html example.template.js
	node generate_examples_from_template.js

$(OUTPUT_DIR)/%.css: %.css
	cp $< $@

.PHONY: all $(OUTPUT_DIR)/index.html
