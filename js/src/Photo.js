import './Photos.scss';

import '@fortawesome/fontawesome-free/scss/solid.scss';
import '@fortawesome/fontawesome-free/scss/fontawesome.scss';
import { install, mintToken } from 'intrustd';


install({permissions: [ "intrustd+perm://photos.intrustd.com/comment",
                        "intrustd+perm://photos.intrustd.com/comment/transfer",
			"intrustd+perm://photos.intrustd.com/upload",
			"intrustd+perm://photos.intrustd.com/view",
                        "intrustd+perm://photos.intrustd.com/view/transfer",
			"intrustd+perm://photos.intrustd.com/gallery",
                        "intrustd+perm://photos.intrustd.com/gallery/transfer",
                        "intrustd+perm://photos.intrustd.com/albums/create",
                        "intrustd+perm://photos.intrustd.com/albums/create/transfer",
                        "intrustd+perm://admin.intrustd.com/guest/transfer" ],
         appName: 'photos.intrustd.com',
         requiredVersion: '0.5.1585606202',
         oninstall: () => {
             const App = require('./App.js')
             App.start()
         } })
