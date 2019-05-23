import subprocess
import json

def ffprobe(fn):
    p = subprocess.Popen(['ffprobe', '-v', 'quiet',
                          '-print_format', 'json',
                          '-show_format', '-show_streams',
                          fn], executable='ffprobe',
                         stdout=subprocess.PIPE, close_fds=True)

    (stdout, _) = p.communicate()
    r = json.loads(stdout)

    p.wait()

    if p.returncode != 0:
        raise RuntimeError('ffprobe returned {}'.format(p.returncode))

    return r
