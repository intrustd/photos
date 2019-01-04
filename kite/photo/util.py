import os

def get_photo_dir(inner=None, absolute=False):
    if inner is None:
        ret = os.getenv('KITEPHOTOS')
    else:
        ret = os.path.join(get_photo_dir(), inner)

    if absolute:
        ret = os.path.abspath(ret)

    return ret

def get_photo_path(inner=None, absolute=False, size=None):
    if size is None:
        return get_photo_dir(inner=inner, absolute=absolute)
    elif isinstance(size, int):
        root, ext = os.path.splitext(inner)
        return get_photo_dir(inner="{}@{}.jpg".format(root, size),
                             absolute=absolute)
    else:
        raise TypeError("Expected None or int/long for size")

def datetime_json(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%S")
