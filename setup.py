# Always prefer setuptools over distutils
from setuptools import setup, find_packages
from os import path

setup(
    name="intrustd-photos",
    version="0.1.0",
    description="Intrustd Photo App",
    packages=['intrustd.photo'],
    install_requires=["Flask>=0.2", "Pillow" ],
    entry_points={
        'console_scripts': [ 'photos=intrustd.photo:main', 'photo-perms=intrustd.photo.perms:verify' ]
    }
)
