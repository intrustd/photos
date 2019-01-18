from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, \
    func, create_engine
from sqlalchemy.orm import relationship, sessionmaker
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

    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)

    tags = relationship('PhotoTag', cascade='delete,delete-orphan')

    def to_json(self):
        return { 'id': self.id,
                 'description': self.description,
                 'created': datetime_json(self.created_on),
                 'modified': datetime_json(self.modified_on),
                 'width': self.width,
                 'height': self.height }

class PhotoTag(Base):
    __tablename__ = 'photo_tag'

    photo_id = Column(String(32), ForeignKey('photo.id'), primary_key=True)
    tag = Column(String, primary_key=True)

class Version(Base):
    __tablename__ = 'version'

    version = Column(Integer, primary_key=True)

engine = create_engine("sqlite:///" + get_photo_dir(".photos.db", absolute=True))

Session = sessionmaker(bind=engine)

def do_migrate():
    latest_version = 2

    session = Session()
    connection = engine.connect()

    try:
        if not engine.dialect.has_table(engine, 'version'):
            connection.execute('CREATE TABLE version(version integer primary key)')

        res = list(session.query(Version).order_by(Version.version.desc()).limit(1))
        version = 0
        if len(res) > 0:
            version = res[0].version

        if version <= 0:
            connection.execute('''
              CREATE TABLE photo(id CHAR(32) PRIMARY KEY,
                                 description VARCHAR NOT NULL,
                                 created_on TIMESTAMP NOT NULL,
                                 modified_on TIMESTAMP NOT NULL)
            ''')
            connection.execute('''
              CREATE TABLE photo_tag(photo_id CHAR(32) NOT NULL,
                                     tag VARCHAR NOT NULL,
                                     PRIMARY KEY (photo_id, tag))
            ''')

        if version <= 1:
            connection.execute('''
               ALTER TABLE photo ADD COLUMN width INTEGER
            ''')
            connection.execute('''
               ALTER TABLE photo ADD COLUMN height INTEGER
            ''')

        if version < latest_version:
            session.add(Version(version=latest_version))
        session.commit()

    finally:
        session.close()
        connection.close()

do_migrate()

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


