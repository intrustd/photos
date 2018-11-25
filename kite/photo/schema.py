from sqlalchemy import Column, Integer, String, DateTime, \
    func, create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base

from contextlib import contextmanager

from .util import get_photo_dir, datetime_json

Base = declarative_base()

class Photo(Base):
    __tablename__ = 'photo'

    id = Column(String(32), primary_key=True)
    description = Column(String)
    created_on = Column(DateTime, default=func.now())
    modified_on = Column(DateTime, onupdate=func.now(), default=func.now())

    def to_json(self):
        return { 'id': self.id,
                 'description': self.description,
                 'created': datetime_json(self.created_on),
                 'modified': datetime_json(self.modified_on) }

print("Using file", get_photo_dir(".photos.db"))
engine = create_engine("sqlite:///" + get_photo_dir(".photos.db", absolute=True))
database = Base.metadata.create_all(engine)

Session = sessionmaker(bind=engine)

@contextmanager
def session_scope():
    """Provide a transactional scope around a series of operations."""
    session = Session()
    try:
        yield session
        session.commit()
    except:
        session.rollback()
        raise
    finally:
        session.close()
