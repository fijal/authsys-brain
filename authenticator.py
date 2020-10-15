
from authsys_common.scripts import get_config
from autobahn.twisted.wamp import ApplicationSession
from twisted.internet.defer import inlineCallbacks, returnValue

class AuthSession(ApplicationSession):
    def auth(self, realm, id, details):
        if id == 'frontdesk':
            return {u'role': u'frontdesk',
                    u'secret': unicode(get_config().get('auth', 'secret'))}
        else:
            return {}

    def onConnect(self):
        self.join(self.config.realm, [u"wampcra"], u"authenticator")

    @inlineCallbacks
    def onJoin(self, details):
        yield self.register(self.auth, u'com.auth')
