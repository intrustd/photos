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

verify = perms.verify_cmd

if __name__ == "__main__":
    verify()
