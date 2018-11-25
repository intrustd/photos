import grpc

from .proto.photo_pb2_grpc import PhotosServicer
from .proto.photo_pb2 import *

class PhotoService(PhotosServicer):
    def ListAlbums(self, request, context):
        print("Got ListAlbums", request)
        yield AlbumEntry(album_name = "Test", photo_count = 2, album_description = "My Test")
