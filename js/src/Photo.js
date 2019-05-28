import UIKit from 'uikit';
import 'uikit/src/less/uikit.theme.less';

import './Photos.scss';

import 'font-awesome/scss/font-awesome.scss';
import { install, mintToken } from 'intrustd';

console.log("Installing xml http request")
install({permissions: [ "intrustd+perm://photos.intrustd.com/comment",
                        "intrustd+perm://photos.intrustd.com/comment/transfer",
			"intrustd+perm://photos.intrustd.com/upload",
			"intrustd+perm://photos.intrustd.com/view",
                        "intrustd+perm://photos.intrustd.com/view/transfer",
			"intrustd+perm://photos.intrustd.com/gallery",
                        "intrustd+perm://photos.intrustd.com/gallery/transfer",
                        "intrustd+perm://admin.intrustd.com/guest/transfer" ],
         appName: 'photos.intrustd.com',
         requiredVersion: '0.2.0',
         oninstall: () => {
             require('./App.js')
         } })
