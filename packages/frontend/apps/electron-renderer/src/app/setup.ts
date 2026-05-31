// Story setup — minimal bootstrap (env + theme, skip full electron bootstrap)
import '@affine/core/bootstrap/env';
import '@affine/core/bootstrap/cleanup';
import '@affine/component/theme';
import './global.css';

import { apis } from '@affine/electron-api';
import { bindNativeDBApis } from '@affine/nbstore/sqlite';
import { bindNativeDBV1Apis } from '@affine/nbstore/sqlite/v1';

if (apis?.nbstore) {
  bindNativeDBApis(apis.nbstore);
}
if (apis?.db) {
  bindNativeDBV1Apis(apis.db);
}
