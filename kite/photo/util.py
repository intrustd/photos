import os

def get_photo_dir(inner=None, absolute=False):
    if inner is None:
        ret = os.getenv('KITEPHOTOS')
    else:
        ret = os.path.join(get_photo_dir(), inner)

    if absolute:
        ret = os.path.abspath(ret)

    return ret

def datetime_json(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%S")
