# Always prefer setuptools over distutils
from setuptools import setup, find_packages
from os import path

setup(
    name="kite-photos",
    version="0.1.0",
    description="Kite Photo App",
    packages=find_packages(),
    install_requires=["Flask>=0.2"],
    entry_points={
        'console_scripts': [ 'photos=kite.photo:main', 'photo-perms=kite.photo.perms:verify' ]
    }
)
