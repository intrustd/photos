import sys
import json
import argparse
import warnings
from urllib.parse import urlparse, urlunparse, urljoin
from collections.abc import Mapping, Sequence, Callable

import re
import requests
from enum import Enum, auto
from re import sre_parse
from copy import deepcopy

KITE_TRANSFER_SUFFIX="/transfer"
KITE_TRANSFER_ONCE_SUFFIX="/transfer_once"
def get_base_perm(perm):
    while perm.endswith(KITE_TRANSFER_SUFFIX) or \
        perm.endswith(KITE_TRANSFER_ONCE_SUFFIX):

        if perm.endswith(KITE_TRANSFER_SUFFIX):
            perm = perm[:-len(KITE_TRANSFER_SUFFIX)]
        else:
            perm = perm[:-len(KITE_TRANSFER_ONCE_SUFFIX)]

    return perm

class KitePermSchemaMismatchError(Exception):
    def __init__(self, got):
        self.actual_schema = got

    def __str__(self):
        return "Expected kite+perm as URL scheme, got '{}'".format(self.actual_schema)

class KitePermAppMismatchError(Exception):
    def __init__(self, expected, actual):
        self.expected = expected
        self.actual = actual

    def __str__(self):
        return "This permission is not from this application(hostname={}), got {}"\
            .format(self.expected, self.actual)

def validate_permissions_url(url, hostname=None):
    res = urlparse(url)
    if res.scheme != 'kite+perm':
        if hostname is None or res.hostname is not None:
            raise KitePermSchemaMismatchError(res.scheme)
        else:
            res = res._replace(netloc=hostname,
                               scheme='kite+perm')

    return res._replace(path=res.path.rstrip('/'))

def persona_id(s):
    if len(s) == 64 and s.isalnum():
        return s
    else:
        raise TypeError("{} is not a valid persona ID".format(s))

# Templates

class TemplateParseState(Enum):
    PS_LITERAL = auto()
    PS_SUB_NAME = auto()
    PS_SUB_VALIDATE = auto()
    PS_SUB_VALIDATOR = auto()
    PS_SUB_VALIDATOR_NAME = auto()
    PS_SUB_VALIDATE_ARG_START = auto()
    PS_SUB_VALIDATE_ARG_DQUOTE = auto()
    PS_SUB_VALIDATE_ARG_SQUOTE = auto()
    PS_SUB_VALIDATE_ARG_DQUOTE_ESCAPE = auto()
    PS_SUB_VALIDATE_ARG_SQUOTE_ESCAPE = auto()
    PS_SUB_VALIDATE_END = auto()

class TemplToken(object):
    pass

class LiteralToken(TemplToken):
    def __init__(self, literal):
        self.literal = literal

    def __str__(self):
        return "<Literal {}>".format(repr(self.literal))

    def __repr__(self):
        return str(self)

    def to_string(self, data=None):
        return self.literal

    def match(self, s, args):
        if s.startswith(self.literal):
            return s[len(self.literal):]
        else:
            return None

class PlaceholderToken(TemplToken):
    def __init__(self, name, validator=None, validator_name=None):
        self.name = name
        self.validator = validator
        self.validator_name = validator_name

    def to_string(self, data=None):
        if self.name not in data:

            if self.validator is not None:
                return '<{} {}{}>'.format(self.name, self.validator_name, repr(self.validator.arg))
            else:
                return '<{}>'.format(self.name)

        else:
            s = data[self.name]

            if self.validator is not None and \
               self.validator.match(s) is None:
                raise ValueError("Invalid value for placeholder {}: {}".format(self.name, s))

            return s

    def match(self, s, args):
        if self.validator is not None:
            res = self.validator.match(s)
            if res is None:
                return None
            else:
                args[self.name] = res[0]
                return res[1]
        else:
            args[self.name] = s
            return ""

class Validator(object):
    pass

class ReValidator(object):
    def __init__(self, regex):
        self.regex_str = regex
        self.regex = re.compile(regex)

    @property
    def arg(self):
        return str(self.regex_str)

    def match(self, s):
        m = self.regex.match(s)
        if m is not None:
            match = s[m.start():m.end()]
            rest = s[m.end():]
            return match, rest
        else:
            return None

    def __deepcopy__(self, memo):
        return ReValidator(self.regex_str)

default_validators={}

def parse_template(templ, validators=None):
    result = []
    cur_name = None
    cur_validator = None
    cur_validator_name = None
    cur_token = ""
    placeholders = set()
    state = TemplateParseState.PS_LITERAL

    final_validators = {}
    final_validators.update(default_validators)
    final_validators.update(validators or {})

    for c in templ:
        if state is TemplateParseState.PS_LITERAL:
            if c == '<':
                if len(cur_token) > 0:
                    result += [ LiteralToken(cur_token) ]
                state = TemplateParseState.PS_SUB_NAME
                cur_token = ""
            else:
                cur_token += c
        elif c == '>' and state in ( TemplateParseState.PS_SUB_NAME, TemplateParseState.PS_SUB_VALIDATE, TemplateParseState.PS_SUB_VALIDATE_END ):
            if state == TemplateParseState.PS_SUB_NAME:
                cur_name = cur_token
                validator = None
            else:
                validator = cur_validator(cur_token)

            if len(cur_name) == 0:
                raise ValueError("Empty string in token name")

            if cur_name in placeholders:
                raise ValueError("Duplicate token {}".format(cur_name))

                placeholders.add(cur_name)

            result += [ PlaceholderToken(cur_name, validator=validator, validator_name=cur_validator_name) ]
            placeholders.add(cur_name)
            cur_token = ""
            cur_name = cur_validator = cur_validator_name = None
            state = TemplateParseState.PS_LITERAL
        elif state is TemplateParseState.PS_SUB_NAME:
            if c.isspace():
                cur_name = cur_token
                cur_token = ""
                state = TemplateParseState.PS_SUB_VALIDATE
            elif not c.isalnum() and c != '_':
                raise ValueError("Invalid character {} in placeholder name".format(c))
            else:
                cur_token += c
        elif state is TemplateParseState.PS_SUB_VALIDATE:
            if c.isspace():
                pass
            elif c == '~':
                cur_validator = ReValidator
                cur_validator_name = "~"
                cur_token = ""
                state = TemplateParseState.PS_SUB_VALIDATE_ARG_START
            elif c.isalnum() or c == '_':
                state = TemplateParseState.PS_SUB_VALIDATOR_NAME
                cur_token = c
                cur_validator = None
                cur_validator_name = None
            else:
                raise ValueError("Invalid character {} in validator name".format(c))
        elif state is TemplateParseState.PS_SUB_VALIDATOR_NAME:
            if c == ':':
                try:
                    cur_validator = validators[cur_token]
                except KeyError:
                    raise KeyError("Could not find validator {}".format(cur_token))
                cur_token = ""
                cur_validator_name = cur_token + ':'
                state = TemplateParseState.PS_SUB_VALIDATE_ARG_START
            elif not c.isalnum() and not c == '_':
                raise ValueError("Invalid character {} in validator name".format(c))
            else:
                cur_token += c
        elif state is TemplateParseState.PS_SUB_VALIDATE_ARG_START:
            if c == '"':
                state = TemplateParseState.PS_SUB_VALIDATE_ARG_DQUOTE
            elif c == "'":
                state = TemplateParseState.PS_SUB_VALIDATE_ARG_SQUOTE
            else:
                raise ValueError("Expected ' or \" in validate argument")
        elif state is TemplateParseState.PS_SUB_VALIDATE_ARG_DQUOTE:
            if c == '\\':
                state = TemplateParseState.PS_SUB_VALIDATE_ARG_DQUOTE_ESCAPE
            elif c == '"':
                state = TemplateParseState.PS_SUB_VALIDATE_END
            else:
                cur_token += c
        elif state is TemplateParseState.PS_SUB_VALIDATE_ARG_SQUOTE:
            if c == '\\':
                state = TemplateParseState.PS_SUB_VALIDATE_ARG_SQUOTE_ESCAPE
            elif c == "'":
                state = TemplateParseState.PS_SUB_VALIDATE_END
            else:
                cur_token += c
        elif state in ( TemplateParseState.PS_SUB_VALIDATE_ARG_SQUOTE_ESCAPE,
                        TemplateParseState.PS_SUB_VALIDATE_ARG_DQUOTE_ESCAPE ):
            if c == 'a':
                cur_token += '\a'
            elif c == 'b':
                cur_token += '\b'
            elif c == 'f':
                cur_token += '\f'
            elif c == 'n':
                cur_token += '\n'
            elif c == 'r':
                cur_token += '\r'
            elif c == 't':
                cur_token += '\t'
            elif c == 'v':
                cur_token += '\v'
            elif c == '\\':
                cur_token += '\\'
            else:
                raise ValueError("Invalid escape code \\{}".format(c))

            if state is TemplateParseState.PS_SUB_VALIDATE_ARG_SQUOTE_ESCAPE:
                state = TemplateParseState.PS_SUB_VALIDATE_ARG_SQUOTE
            else:
                state = TemplateParseState.PS_SUB_VALIDATE_ARG_DQUOTE
        elif state is TemplateParseState.PS_SUB_VALIDATE_END:
            if not c.isspace():
                raise ValueError("Expected > after validate arg")

    if state is not TemplateParseState.PS_LITERAL:
        raise ValueError("End of template while parsing")

    if len(cur_token) > 0:
        result += [ LiteralToken(cur_token) ]

    return (placeholders, result)

class ReversibleTemplate(object):
    def __init__(self, templ, validators=None, copy=None):
        if not isinstance(templ, str):
            raise TypeError("Expected string")

        placeholders, res = parse_template(templ, validators=validators)

        self.placeholders = placeholders
        self.template = res
        self.data = {}

    @property
    def has_placeholders(self):
        return len(self.placeholders) > 0

    def fill(self, **kwargs):
        new = deepcopy(self)

        for nm in kwargs:
            if nm not in new.placeholders:
                raise KeyError(nm)

            new.placeholders.remove(nm)

        new.data.update(kwargs)
        return new

    def to_string(self):
        return ''.join(token.to_string(self.data) for token in self.template)

    def match(self, s):
        args = {}
        for token in self.template:
            next_s = token.match(s, args)
            if next_s is None:
                return None
            else:
                s = next_s

        if len(s) > 0:
            return None

        return self.fill(**args)

# Permissions

class MissingPermissionsError(Exception):
    def __init__(self, missing):
        self.missing = missing

class SearchFailed(Exception):
    pass

class SearchSucceeded(Exception):
    pass

class PredicateSearcher(object):
    def __init__(self, perms):
        self._perms = perms
        self._schema = perms._schema

    def reject(self):
        raise SearchFailed()

    def _search_one(self, pred):
        if isinstance(pred, str):
            pred = self._schema.parse_perm(pred)
        elif not isinstance(pred, Permission):
            raise TypeError("Expected str or Permission")

        for perm in self._perms:
            if pred.match(perm):
                yield pred.spec_pattern.data

    def search(self, *args):
        for pred in args:
            for res in self._search_one(pred):
                yield res

    def satisfy(self):
        raise SearchSucceeded()

class PermissionSet(object):
    def __init__(self, schema=None):
        self._perms = set()
        self._schema = schema

    def __len__(self):
        return len(self._perms)

    def __iter__(self):
        return iter(self._perms)

    def __str__(self):
        return str(self._perms)

    def __repr__(self):
        return "<PermissionSet {}>".format(str(self))

    def add(self, *args):
        for url in args:
            self._perms.add(self._make_perm(url))

    def remove(self, *args):
        for url in args:
            self._perms.remove(self._make_perm(url))

    def _make_perm(self, url):
        if isinstance(url, str):
            ps = validate_permissions_url(url, hostname=self._schema.url.hostname if self._schema is not None else None)
            ps = ps._replace(netloc="", scheme="")
            return urlunparse(ps)
        elif isinstance(url, Permission):
            if url.is_complete:
                return url.spec
            else:
                raise ValueError("Cannot add/remove incomplete permission to set")
        else:
            raise TypeError("Expected str or Permission")

    @property
    def permissions(self):
        return self._perms

    def __contains__(self, x):
        if isinstance(x, str):
            x = self._make_perm(x)
            if x not in self._perms:
                if self._schema is None:
                    return False
                else:
                    perm = self._schema.parse_perm(x)
                    if perm is None:
                        return False

                    try:
                        perm.search(PredicateSearcher(self))
                        return False
                    except SearchSucceeded as e:
                        return True
                    except SearchFailed as e:
                        return False
            else:
                return True
        elif isinstance(x, Permission):
            return x.url in self
        elif isinstance(x, Iterable):
            return all(perm in self for perm in x)
        else:
            raise TypeError("expected a string or a collection of strings")

class Permissions(object):
    def __init__(self, base):
        self.url = validate_permissions_url(base)
        self.perms = []

    def _set(self, args, ignore_external=False):
        for arg in args:
            if isinstance(arg, str):
                res = urlparse(arg)

                if len(res.scheme) == 0 and res.hostname is None:
                    res = self.url._replace(path=arg)

                if res.hostname is not None and res.hostname != self.url.hostname:
                    if ignore_external:
                        continue
                    else:
                        raise ValueError("External permission cannot be added to this permission set: {}".format(arg))

                yield urlunparse(res)
            elif isinstance(arg, Sequence):
                for x in self._set(arg):
                    yield x
            elif isinstance(arg, Permission):
                yield arg.url
            else:
                raise TypeError("Expected str, permission, or Sequence")

    def set(self, *args, ignore_external=False):
        perms = PermissionSet(self)
        ps = list(self._set(args, ignore_external=ignore_external))
        perms.add(*ps)
        return perms

    def permission(self, spec):
        if not spec.startswith('/'):
            spec = '/{}'.format(spec)

        if any(perm.spec == spec for perm in self.perms):
            warnings.warn('Duplicate spec {}'.format(spec))

        perm = Permission(self, spec)
        self.perms.append(perm)

        return perm

    def parse_perm(self, perm_str):
        res = urlparse(perm_str)
        if len(res.scheme) > 0 and res.scheme != 'kite+perm':
            raise ValueError("Expected kite+perm scheme")

        if res.hostname is not None and res.hostname != self.url.hostname:
            raise KitePermAppMismatchError(self.url.hostname, res.hostname)

        perm_str = get_base_perm(res.path)

        for perm in self.perms:
            new_perm = perm.matches_string(perm_str)
            if new_perm is not None:
                return new_perm
        return None

    def normalize_perm(self, perm, *args, **kwargs):
        if isinstance(perm, str):
            return self.parse_perm(perm).fill_any(*args, **kwargs)
        elif isinstance(perm, Permission):
            return perm.fill_any(*args, **kwargs)
        elif isinstance(perm, Callable):
            return perm(*args, **kwargs)
        else:
            raise TypeError("Expected str or Permission")

    def get_current_requestor(self):
        from flask import request
        return request.remote_addr

    def get_current_permissions(self, requestor_id=None, app_endpoint='http://admin.flywithkite.com.kite.local'):
        from werkzeug.exceptions import NotFound, Unauthorized

        if requestor_id is None:
            requestor_id = self.get_current_requestor()

        url = urljoin(app_endpoint, '/{}/permissions'.format(requestor_id))
        r = requests.get(url)

        if r.status_code == 200:
            perms = r.json()
            if isinstance(perms, Sequence):
                return self.set(*perms, ignore_external=True)
            else:
                raise RuntimeError("Fetching permissions did not return a sequence")
        elif r.status_code == 404:
            raise NotFound()
        elif r.status_code == 403:
            raise Unauthorized()
        else:
            raise RuntimeError("Unknown status code while looking for tokens: {}".format(r.status_code))

    def require(self, reqs):
        from flask import request

        default = []
        requirements = reqs

        if not isinstance(reqs, Mapping):
            default = reqs
            requirements = {}

        def decorate(fn):
            def wrapped(*args, **kwargs):
                perms = requirements.get(request.method, default)

                if not isinstance(perms, Sequence):
                    perms = [ perms ]

                perms = [ self.normalize_perm(perm, *args, **kwargs) for perm in perms ]

                cur_perms = self.get_current_permissions()
                print("Got permissions", cur_perms)
                missing_perms = [ perm for perm in perms if perm not in cur_perms ]

                if len(missing_perms) == 0:
                    return fn(*args, **kwargs)
                else:
                    raise MissingPermissionsError(missing_perms)

            wrapped.__name__ = fn.__name__

            return wrapped

        return decorate

    def verify_cmd(self):
        parser = argparse.ArgumentParser(description="Verify permissions for this app")

        action = parser.add_mutually_exclusive_group()
        action.add_argument("-L", "--lookup", help="Look up the specified option",
                            dest="action", action="store_const", const="lookup")
        action.add_argument("-c", "--check", help="Check that the given permission exists based on the set of permissions read from stdin",
                            dest="action", action="store_const", const="check")

        parser.add_argument("-p", "--persona", help="Persona ID to use", type=persona_id)
        parser.add_argument("-a", "--application", help="Application ID to use", type=str)

        parser.add_argument("permission", nargs="+")

        args = parser.parse_args()

        if args.action == "lookup":
            for p in args.permission:
                perm = self.parse_perm(p)
                if perm is None:
                    print()
                else:
                    print(json.dumps(perm.kite_description))
        elif args.action == "check":
            existing = self.set()

            query = self.set()

            for p in args.permission:
                perm = self.parse_perm(p)
                if perm is None:
                    print("Invalid permission on command line: {}".format(p), file=sys.stderr)
                    exit(3)
                else:
                    query.add(perm)

            while True:
                try:
                    line = input()
                except EOFError:
                    break
                if line == "":
                    break
                else:
                    try:
                        perm = self.parse_perm(line)
                    except KitePermAppMismatchError:
                        continue

                    if perm is None:
                        print("Invalid permission on stdin: {}".format(line), file=sys.stderr)
                        exit(3)
                    else:
                        existing.add(perm)

            accepted = self.set()
            denied = self.set()
            for p in query:
                if p in existing:
                    accepted.add(p)
                else:
                    denied.add(p)

            print(json.dumps({ 'accepted': list(accepted), 'denied': list(denied) }))

        else:
            parser.print_help()
            exit(2)

class Permission(object):
    def __init__(self, perms, spec, extension=None, base=None):
        self.perms = perms

        if isinstance(spec, str):
            self.spec = spec
            self.spec_pattern = ReversibleTemplate(spec)
        elif isinstance(spec, ReversibleTemplate):
            self.spec = spec.to_string()
            self.spec_pattern = spec
        else:
            raise TypeError("Expected str or ReversibleTemplate for Permission")

        self.is_complete = not self.spec_pattern.has_placeholders
        self.extension = extension
        self.base = base or self

    def __hash__(self):
        return hash(self.spec)

    def __eq__(self, b):
        return isinstance(b, Permission) and self.spec == b.spec

    @property
    def url(self):
        if not self.is_complete:
            raise ValueError("Permission is incomplete")

        return urlunparse(self.perms.url._replace(path=self.spec))

    @property
    def pattern(self):
        return urlunparse(self.perms.url._replace(path=self.spec))

    def __repr__(self):
        return str(self)

    def __str__(self):
        return "<Permission {}>".format(self.spec_pattern.to_string())

    def __call__(self, *args, **kwargs):
        if self.is_complete:
            raise TypeError("Cannot extend complete permission")

        elif self.extension is None and len(args) == 1 and len(kwargs) == 0 and \
             isinstance(args[0], type):

            self.extension = args[0]
            return self

        else:
            return self._fill(*args, **kwargs)

    def fill_any(self, *args, **kwargs):
        if self.is_complete:
            return self

        else:
            filtered_kwargs = {}
            for k, v in kwargs.items():
                if k in self.spec_pattern.placeholders:
                    filtered_kwargs[k] = v
            self(**filtered_kwargs)

    def _fill(self, *args, **kwargs):
        return Permission(self.perms, self.spec_pattern.fill(**kwargs), extension=self.extension, base=self.base)

    def search(self, search):
        if self.extension is None:
            search.reject()
        else:
            self.extension(**self.spec_pattern.data).search(search)

    def matches_string(self, s):
        new_pattern = self.spec_pattern.match(s)
        if new_pattern is not None:
            return Permission(self.perms, new_pattern,
                              extension=self.extension, base=self.base)
        else:
            return None

    def match(self, other):
        if isinstance(other, str):
            return self.match(self.perms.parse_perm(other))
        elif isinstance(other, Permission):
            return other.base is self.base and self.spec_pattern.data == other.spec_pattern.data
        else:
            raise TypeError("Expected str or Permission")

    @property
    def kite_description(self):
        return { 'name': self.spec, # TODO fill these in properly
                 'description': 'TODO',
                 'needs_site': False,
                 'needs_persona': False,
                 'needs_login': False,
                 'dynamic': True }

# mkperm

class Placeholder(object):
    def __init__(self, name):
        self.name = name

def mkperm(cons, *args, **kwargs):
    def wrapped(*wargs, **wkwargs):
        fn_args = [ wkwargs[arg.name] if isinstance(arg, Placeholder) else arg for arg in args ]
        fn_kwargs = dict((k, wkwargs[arg.name]) if isinstance(arg, Placeholder) else (k, arg) for k, arg in kwargs.items())

        return cons(*fn_args, **fn_kwargs)

    wrapped.__name__ = getattr(cons, '__name__', wrapped.__name__)

    return wrapped
