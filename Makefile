#
# Special notes:
# 1. Tests are always run on the instrumented source just to keep things simple. Speed is not a problem.
# 2. Everything is written in AMD style, hence uses amdefine for the Node bits, hence gives useless errors if it doesn't parse, hence jshint is crucial.

BIN=node_modules/.bin
MOCHA=$(BIN)/mocha --harmony-proxies --harmony-collections
ISTANBUL=$(BIN)/istanbul
JSHINT=$(BIN)/jshint
R_JS=$(BIN)/r.js

#
# .PHONY targets for the command-line
#

.PHONY: all
all: optimized debug

.PHONY: debug
debug: # TODO

.PHONY: optimized
optimized: #TODO

.PHONY: jshint
jshint:
	$(JSHINT) --verbose src spec

.PHONY: test
test: jshint
	$(MOCHA) --reporter dot ./spec/mocha-spec-runner.js

.PHONY: coverage
coverage: jshint lib-cov
	ISTANBUL_REPORTERS=text-summary,html,lcov SOLIDSTATE_PATH=lib-cov/solidstate $(MOCHA) --reporter mocha-istanbul ./spec/mocha-spec-runner.js

#
# Actual file targets
#

lib-cov: src/solidstate.js 
	rm -rf lib-cov
	mkdir -p lib-cov
	$(ISTANBUL) instrument --output lib-cov --no-compact --variable global.__coverage__ src
