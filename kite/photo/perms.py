from kite.permissions import Permissions

perms = Permissions('kite+perm://photos.flywithkite.com')

CommentAllPerm = perms.permission('/comment')
ViewAllPerm = perms.permission('/view')
GalleryPerm = perms.permission('/gallery')
UploadPerm = perms.permission('/upload')

@perms.permission('/view/<photo_id ~"[a-fA-F0-9]{64}">')
class ViewPerm(object):
    def __init__(self, photo_id=None):
        self.photo_id = photo_id

    def search(self, search):
        for _ in search.search(ViewAllPerm):
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

def image_thumbnail_gallery(imgs):
    gallery = []
    for img in imgs:
        gallery.append('![{img}](kite+app://photos.flywithkite.com/image/{img})'.format(img=img))

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
        perms.app(p)

    actions = []
    if gallery:
        actions.append("list")

    if view:
        actions.append("view")

    if comment:
        actions.append("comment")

    if upload:
        actions.append("upload")

    if len(actions) == 0:
        return [], set()

    else:
        actions[0] = actions[0].title()
        action_string = ", ".join("*{}*".format(action) for action in actions)

        return [ { 'short': '{} on images'.format(action_string) } ], perms

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
