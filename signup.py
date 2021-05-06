
import main, base64, py, os, time, json, traceback
from authsys_common.scripts import get_db_url, get_config
from authsys_common.model import members, daily_passes
from authsys_common.mandate import create_mandate
from authsys_common import queries as q

from sqlalchemy import select, func

from txrestapi.resource import APIResource
from txrestapi import methods

from autobahn.twisted.wamp import ApplicationSession, ApplicationRunner
from autobahn.wamp import auth

from twisted.internet.defer import inlineCallbacks, returnValue
from twisted.web.server import NOT_DONE_YET
from twisted.internet import reactor

import treq
# 62617379690

conf = get_config()

DIRECT_BASE_URL = conf.get('payment', 'direct_url')
DIRECT_PASSWORD = conf.get('payment', 'direct_password')
DIRECT_USERNAME = conf.get('payment', 'direct_user')

banks = {
   'absa bank': ('Absa Bank', 632005),
   'capitec bank': ('Capitec Bank', 470010),
   'first national bank (south africa)': ('First National Bank (South Africa)', 250655),
   'investec bank': ('Investec Bank', 580105),
   'nedbank (south africa)': ('Nedbank (South Africa)', 198765),
   'nedbank corporate saver account': ('Nedbank Corporate Saver Account', 720026),
   'postbank': ('Postbank', 460005),
   'standard bank (south africa)': ('Standard Bank (South Africa)', 51001),
   'african bank': ('African Bank', 430000),
   'albaraka bank': ('Albaraka Bank', 800000),
   'bank of namibia': ('Bank Of Namibia', 980172),
   'bidvest bank': ('Bidvest Bank', 462005),
   'central bank of lesotho': ('Central Bank Of Lesotho', 586611),
   'citi bank': ('Citi Bank', 350005),
   'finbond mutual bank': ('Finbond Mutual Bank', 589000),
   'first national bank lesotho': ('First National Bank Lesotho', 280061),
   'first national bank namibia': ('First National Bank Namibia', 282672),
   'first national bank swaziland': ('First National Bank Swaziland', 287364),
   'grinrod bank': ('Grinrod Bank', 584000),
   'hsbc bank': ('Hsbc Bank', 587000),
   'jp morgan chase bank': ('Jp Morgan Chase Bank', 432000),
   'meeg bank': ('Meeg Bank', 471001),
   'merchantile bank': ('Merchantile Bank', 450105),
   'mtn banking': ('Mtn Banking', 490991),
   'standard bank namibia': ('Standard Bank Namibia', 87373),
   'state bank of india': ('State Bank Of India', 801000),
   'ubank': ('Ubank', 431010),
   'unibank': ('Unibank', 790005),
   'vbs mutual bank': ('Vbs Mutual Bank', 588000)
}

branch_code_lookup = {}

for bank, branch_code in banks.itervalues():
    branch_code_lookup[branch_code] = bank

def makeConnectionLost(req_data, gym_id, old_lc, node):
    def connectionLost(self, *args, **kwds):
        old_lc(self, *args, **kwds)
        node.publish(u'com.ipad.update', {'gym_id': gym_id, 'update': "lost"})
        req_data.current_request[gym_id] = None
    return connectionLost

class Component(ApplicationSession):
    def __init__(self, signup, *args):
        self.signup = signup
        ApplicationSession.__init__(self, *args)

    def get_current_ipad_status(self, gym_id):
        cr = current_request_data.current_request[gym_id]
        if cr is None:
            return {'present': False}
        return {'present': True, 'origin': cr.origin}

    @inlineCallbacks
    def onJoin(self, details):
        self.signup.wamp = self
        yield self.register(self.get_current_ipad_status, u'com.ipad.status')

    def onConnect(self):
        self.join(self.config.realm, [u"wampcra"], u"frontdesk")

    def onChallenge(self, challenge):
        if challenge.method != u'wampcra':
            raise Exception("invalid auth method " + challenge.method)
        if u'salt' in challenge.extra:
            raise Exception("salt unimplemented")
        return auth.compute_wcs(get_config().get('auth', 'secret'),
                                challenge.extra['challenge'])

    def onDisconnect(self):
        print("signup disconnected from session")

class RequestWrapper(object):
    def __init__(self, origin, req):
        self.r = req
        self.origin = origin

class CurrentRequestData(object):
    current_request = [None] * 10

    def update(self, node, request):
        gym_id = int(request.args['gym_id'][0])
        origin = request.args['origin'][0]
        request.connectionLost = makeConnectionLost(self, gym_id, request.connectionLost, node)
        node.publish(u'com.ipad.update', {'gym_id': gym_id, 'update': origin})
        if self.current_request[gym_id] is not None:
            try:
                self.current_request[gym_id].r.write("{}")
                self.current_request[gym_id].r.finish()
            except Exception as e:
                print("Error occured: " + str(e))
                # eat all the exceptions here
        self.current_request[gym_id] = RequestWrapper(origin, request)

    def notify(self, node, **kwds):
        gym_id = int(kwds['gym_id'])
        if self.current_request[gym_id] is None:
            print("No request")
            return
        d = kwds.copy()
        d['redirect'] = kwds.get('type')
        try: # maybe the request was stale
            node.publish(u'com.ipad.update', {'gym_id': gym_id, 'update': d['redirect'] + ' in progress'})
            self.current_request[gym_id].r.write(json.dumps(d))
            self.current_request[gym_id].r.finish()
        except:
            print("Found stale request, not notifying")
        finally:
            self.current_request[gym_id] = None


current_request_data = CurrentRequestData()


class SignupManager(APIResource):
    wamp = None

    def __init__(self, arg):
        self.create_wamp_connection()
        APIResource.__init__(self)

    def create_wamp_connection(self):
        if self.wamp is not None:
            return

        runner = ApplicationRunner(u"ws://127.0.0.1:8087/ws", u"authsys")
        runner.run(lambda *args: Component(self, *args), start_reactor=False, auto_reconnect=True)

    @methods.POST('^/signup/submit$')
    def submit(self, request):
        r = main.con.execute(members.insert().values({
            'name': request.args['name'][0].decode('utf8') + u" " + request.args['surname'][0].decode('utf8'),
            'email': request.args['email'][0],
            'phone': request.args['phone'][0],
            'emergency_phone': request.args['emergency-phone'][0],
            'spam_consent': request.args.get('spam', 'off')[0] == u'on',
            'id_number': request.args['id_no'][0],
            'signature_filename': request.args['filename'][0],
            'show_up_reason': request.args['reason'][0],
            'timestamp': int(time.time()),
        }))
        member_id = r.lastrowid
        try:
            int(request.args['gym_id'][0])
        except (KeyError, ValueError):
            gym_id = "null"
        else:
            main.con.execute(daily_passes.insert().values({
                'member_id': member_id,
                'gym_id': int(request.args['gym_id'][0]),
                'timestamp': int(time.time())
                }))
            gym_id = request.args['gym_id'][0]
        #thread.start_new_thread(send_email, (request.args['email'],))
        return py.path.local(__file__).join('..', 'web', 'thankyou.html').read().replace(
            "{{name}}", request.args['name'][0]).replace(
            "{{member_id}}", str(member_id)).replace(
            "{{gym_id}}", gym_id)

    @methods.POST('^/signup/photo')
    def upload_photo(self, request):
        d = request.content.read()
        args = {}
        l = request.uri.split("?")[1].split("&")
        for item in l:
            k, v = item.split("=")
            args[k] = v
        member_id = args['member_id']
        what_for = args['what_for']
        prefix = "data:image/png;base64,"
        assert d.startswith(prefix)
        store_dir = get_config().get('data', 'store_dir')
        # invent new filename
        base_no = member_id
        no = base_no
        fname = os.path.join(store_dir, "photo_%s.png" % no)
        count = 1
        while os.path.exists(fname):
            no = base_no + "_" + str(count)
            fname = os.path.join(store_dir, "photo_%s.png" % no)
            count += 1
        d = d[len(prefix):]
        if (len(d) % 4) != 0:
            d += "=" * (4 - (len(d) % 4))
        with open(fname, "w") as f:
            f.write(base64.b64decode(d, " /"))
        if what_for == 'yourself':
            d = {'photo': fname}
        else:
            d = {'id_photo': fname, 'last_id_update': int(time.time()), 'last_id_checked': int(time.time())}
        main.con.execute(members.update().where(members.c.id == member_id).values(
            **d))
        return json.dumps({'success': True, 'filename': fname, 'what_for': what_for, 'member_id': member_id})

    @methods.GET('^/signup/get_photo')
    def get_photo(self, request):
        member_id = request.args['member_id'][0]
        tp = request.args['tp'][0]
        if tp == 'photo':
            lst = list(main.con.execute(select([members.c.photo]).where(members.c.id == member_id)))
        else:
            lst = list(main.con.execute(select([members.c.id_photo]).where(members.c.id == member_id)))            
        if lst[0][0] is None:
            return ''
        with open(lst[0][0]) as f:
            return f.read()

    @methods.POST('^/signup/poll')
    def poll(self, request):
        self.create_wamp_connection()
        current_request_data.update(self.wamp, request)
        return NOT_DONE_YET

    @methods.POST('^/signup/notify_picture')
    def notify_picture(self, request):
        gym_id = request.args['gym_id'][0]
        member_id = request.args['member_id'][0]
        for_id = request.args['for_id'][0]
        if for_id == 'true':
            what_for = "your ID"
        else:
            what_for = "yourself"
        current_request_data.notify(self.wamp, gym_id=gym_id, member_id=member_id, what_for=what_for, type='photo')
        return json.dumps({'success': True})

    @methods.POST('^/signup/notify')
    def notify(self, request):
        name = request.args['name'][0]
        contact_no = request.args['contact_number'][0]
        current_request_data.notify(self.wamp, gym_id=request.args['gym_id'][0], name=name,
            contact_number=contact_no,
            member_id=request.args['member_id'][0], price=request.args['price'][0],
            subscription_type=request.args['subscription_type'][0],
            next_monday=request.args['next_monday'][0], type='bank')
        return json.dumps({'success': True})

    @methods.GET('^/signup/check_bank_account')
    def check_bank_account(self, request):

        @inlineCallbacks
        def cont1(r):
            r = yield r.json()
            if r['valid']:
                request.write(json.dumps({'success': 'ok'}))
            else:
                request.write(json.dumps({'success': 'error'}))
            request.finish()

        def show_error(fail):
            traceback.print_tb(fail.tb)
            print(fail.value)

        account_type = request.args['account_type'][0]
        branch_code = request.args['branch_code'][0]
        account_number = request.args['account_number'][0]
        d = treq.get(DIRECT_BASE_URL + 'cdv/account', headers={'Accept': 'application/json'},
             auth=(DIRECT_USERNAME, DIRECT_PASSWORD), params={'account_number': account_number, 'branch_code': branch_code})
        d.addCallback(cont1)
        d.addErrback(show_error)
        return NOT_DONE_YET

    @methods.POST('^/signup/submit_bank_details')
    def bank_account_update(self, request):
        id = request.args['member_id'][0]
        name = request.args['name'][0]
        contact_number = request.args['contact-number'][0]
        address = request.args['address'][0]
        price = request.args['price'][0]
        branch_code = banks[request.args['bank'][0]][1]
        account_number = request.args['bank-account'][0]
        url = "/".join(request.prePathURL().split("/")[:3]) + "/notify"
        q.update_account_number(main.con, id, name, price, contact_number, address, branch_code, account_number)
        treq.request("POST", url, headers={"Content-Type": "application/json"}, json={"procedure": "com.notify"})
        # generate a PDF in a separate thread with all the information
        return py.path.local(__file__).join('..', 'web', 'thankyou-bank.html').read().replace(
            '{{gym_id}}', request.args['gym_id'][0])

    @methods.GET('^/signup/thankyou_photo')
    def thankyou_photo(self, request):
        self.wamp.publish(u'com.photo.update', [request.args['gym_id'][0]])
        return py.path.local(__file__).join('..', 'web', 'thankyou_photo.html').read().replace(
            '{{who}}', request.args['name'][0]).replace('{{gym_id}}', request.args['gym_id'][0])

    @methods.GET('^/signup/mandate')
    def get_mandate(self, request):
        request.responseHeaders.addRawHeader('content-type', 'application/pdf')
        member_id = int(request.args['member_id'][0])
        charge_day = int(request.args['charge_day'][0])
        price = int(float(request.args['price'][0]))
        name, address, branch_code, account_no, phone = list(main.con.execute(select([members.c.account_holder_name,
            members.c.address, members.c.branch_code, members.c.account_number, members.c.phone]).where(
            members.c.id == member_id)))[0]
        main.con.execute(members.update().values(debit_order_charge_day=charge_day).where(members.c.id == member_id))
        bank = branch_code_lookup[int(branch_code)]
        if branch_code == "198765" or branch_code == "720026":
            if account_no[0] == "1":
                branch_code = "198765"
                account_type = "1"
            elif account_no[0] == "2":
                branch_code = "198765"
                account_type = "2"
            elif account_no[0] == "9":
                branch_code = "720026"
                account_type = "2"
        elif branch_code == "460005":
            account_type = "2"
        else:
            account_type = "1"

        return create_mandate(charge_day=charge_day,
            member_id=member_id, name=name, address=address, account_number=account_no,
            bank=bank, branch_code=branch_code, account_type=account_type, price=price, phone=phone
            )

    @methods.POST('^/signup/upload_signature')
    def upload_signature(self, request):
        d = request.content.read()
        prefix = "data:image/png;base64,"
        assert d.startswith(prefix)
        store_dir = get_config().get('data', 'store_dir')
        # invent new filename
        no = list(main.con.execute(select([func.count(members)])))[0][0]
        fname = os.path.join(store_dir, "signature_%d.png" % int(no))
        d = d[len(prefix):]
        if (len(d) % 4) != 0:
            d += "=" * (4 - (len(d) % 4))
        with open(fname, "w") as f:
            f.write(base64.b64decode(d, " /"))
        return fname

