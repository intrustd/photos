import os
import subprocess
import json

def ffprobe(fn):
    kwargs = { 'stdout': subprocess.PIPE,
               'stderr': subprocess.PIPE,
               'close_fds': True }

    if 'INTRUSTDDEBUG' not in os.environ:
        kwargs['executable'] = '/bin/ffprobe'

    p = subprocess.Popen(['ffprobe', '-v', 'quiet',
                          '-print_format', 'json',
                          '-show_format', '-show_streams',
                          fn],  **kwargs)

    (stdout, stderr) = p.communicate()
    r = json.loads(stdout)

    p.wait()

    if p.returncode != 0:
        raise RuntimeError('ffprobe returned {}: {}: {}'.format(p.returncode, stderr, (['ffprobe', '-v', 'quiet',
                          '-print_format', 'json',
                          '-show_format', '-show_streams',
                          fn])))

    return r
