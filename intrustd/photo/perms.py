from intrustd.permissions import Permissions

from .schema import session_scope, AlbumItem, Album

perms = Permissions('intrustd+perm://photos.intrustd.com')

CommentAllPerm = perms.permission('/comment')
ViewAllPerm = perms.permission('/view')
GalleryPerm = perms.permission('/gallery')
UploadPerm = perms.permission('/upload')
CreateAlbumsPerm = perms.permission('/albums/create')

@perms.permission('/view/<photo_id ~"[a-fA-F0-9]{64}">')
class ViewPerm(object):
    def __init__(self, photo_id=None):
        self.photo_id = photo_id

    def search(self, search):
        for _ in search.search(ViewAllPerm):
            search.satisfy()

        for _ in search.search(ViewAlbumsPerm):
            search.satisfy()

        for perm in search.search(ViewAlbumPerm):
            with session_scope() as session:
                item = session.query(AlbumItem) \
                              .filter(AlbumItem.album_id==perm.album_id,
                                      AlbumItem.photo_id==self.photo_id).first()
                if item is not None:
                    search.satisfy()

@perms.permission('/upload/guest')
class UploadGuestPerm(object):
    def __init__(self, album_id=None):
        self.album_id = album_id

    def search(self, search):
        for _ in search.search(UploadPerm):
            search.satisfy()

@perms.permission('/comment/<photo_id ~"[a-fA-F0-9]{64}">')
class CommentPerm(object):
    def __init__(self, photo_id=None):
        self.photo_id = photo_id

    def search(self, search):
        for _ in search.search(CommentAllPerm):
            search.satisfy()

    def validate(self):
        print("Need to check if ", self.photo_id, " exists")
        return False

@perms.permission('/albums/view')
class ViewAlbumsPerm(object):
    def __init__(self):
        pass

    def search(self, search):
        for _ in search.search(CreateAlbumsPerm):
            search.satisfy()

@perms.permission(r'/albums/<album_id ~"[0-9a-fA-F]{8}\\-[0-9a-fA-F]{4}\\-[0-9a-fA-F]{4}\\-[0-9a-fA-F]{4}\\-[0-9a-fA-F]{12}">/view')
class ViewAlbumPerm(object):
    def __init__(self, album_id=None):
        self.album_id = album_id

    def search(self, search):
        for _ in search.search(ViewAlbumsPerm):
            search.satisfy()

@perms.permission(r'/albums/<album_id ~"[0-9a-fA-F]{8}\\-[0-9a-fA-F]{4}\\-[0-9a-fA-F]{4}\\-[0-9a-fA-F]{4}\\-[0-9a-fA-F]{12}">/upload/guest')
class UploadAlbumAsGuestPerm(object):
    def __init__(self, album_id=None):
        self.album_id = album_id

    def search(self, search):
        for _ in search.search(UploadPerm):
            search.satisfy()

        for _ in search.search(CreateAlbumsPerm):
            search.satisfy()

def image_thumbnail_gallery(imgs):
    gallery = []
    for img in imgs:
        gallery.append('![{img}](intrustd+app://photos.intrustd.com/image/{img})'.format(img=img))

    return '\n'.join(gallery)

@perms.description
def basic_actions(search):
    perms = set()

    gallery = False
    view = False
    comment = False
    upload = False

    for p in search.search(CommentAllPerm):
        comment = True
        perms.add(p)

    for p in search.search(ViewAllPerm):
        view = True
        perms.add(p)

    for p in search.search(GalleryPerm):
        gallery = True
        perms.add(p)

    for p in search.search(UploadPerm):
        upload = True
        perms.add(p)

    actions = []
    if gallery:
        actions.append("list")

    if view:
        actions.append("view")

    if upload:
        actions.append("upload")

    if comment:
        actions.append("comment on")

    if len(actions) == 0:
        return [], set()

    else:
        actions[0] = actions[0].title()
        action_string = ", ".join("*{}*".format(action) for action in actions)

        return [ { 'short': '{} images'.format(action_string) } ], perms

@perms.description
def upload_guest_permission(search):
    perms = set()

    can_upload_as_guest_only = False
    for p in search.search(UploadGuestPerm):
        perms.add(p)
        can_upload_as_guest_only = True
        for _ in search.search(UploadPerm):
            can_upload_as_guest_only = False
            break

    if can_upload_as_guest_only:
        return [ { 'short': 'Upload images as a guest' } ], perms
    else:
        return [], perms

@perms.description
def view_albums_permission(search):
    perms = set()
    can_create = False
    for p in search.search(ViewAlbumsPerm):
        perms.add(p)
    for p in search.search(CreateAlbumsPerm):
        can_create = True
        perms.add(p)

    if can_create:
        return [ { 'short': '*Create* and *view* albums' } ], perms
    elif len(perms) > 0:
        return [ { 'short': '*View* albums' } ], perms
    else:
        return [], perms

@perms.description
def view_album_permission(search):
    perms = set()
    descs = []

    with session_scope() as session:
        for p in search.search(ViewAlbumPerm):
            album_id = p.album_id

            perms.add(p)
            can_upload = False
            for upload_p in search.search(UploadAlbumAsGuestPerm(album_id=album_id)):
                perms.add(upload_p)
                can_upload = True

            album = session.query(Album).get(album_id)
            if album is None:
                continue

            short =  '*View* the album \'{}\''.format(album.name)

            if can_upload:
                short = '{}, and *upload* photos as a guest'.format(short)

            descs.append({ 'short': short })

    return descs, perms

@perms.description
def view_comment_images_permission(search):
    perms = set()
    images = set()
    for p in search.search(ViewPerm):
        for c in search.search(CommentPerm(photo_id=p.photo_id)):
            perms.add(p)
            perms.add(c)
            images.add(p.photo_id)
            return [ { 'short': '*View* and *comment* on some images',
                       'long': image_thumbnail_gallery(images) } ], perms

@perms.description
def view_images_permission(search):
    perms = list(search.search(ViewPerm))
    images = set(p.photo_id for p in perms)
    if len(perms) == 0:
        return [], set()

    return [ { 'short': '*View* some images',
               'long': image_thumbnail_gallery(images) } ], perms

@perms.description
def comment_images_permission(search):
    perms = list(search.search(CommentPerm))
    images = set(p.photo_id for p in perms)
    if len(perms) == 0:
        return [], set()

    return [ { 'short': '*Comment* on some images',
               'long': image_thumbnail_gallery(images) } ], perms

verify = perms.verify_cmd

if __name__ == "__main__":
    verify()
