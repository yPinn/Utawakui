'use strict';

const { SPOUT_HELPER_ARGUMENT } = require('../shared/spoutOutputContract');

if (process.argv.includes(SPOUT_HELPER_ARGUMENT)) {
  require('./main/spoutHelperEntry').runSpoutHelper();
} else {
  require('./main');
}
