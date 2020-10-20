
import main, base64, py, os, time
from authsys_common.scripts import get_db_url, get_config
from authsys_common.model import members

from sqlalchemy import select, func

from txrestapi.resource import APIResource
from txrestapi import methods


class SignupManager(APIResource):
    def __init__(self, arg):
        APIResource.__init__(self)

    @methods.POST('^/signup/submit$')
    def submit(self, request):
        main.con.execute(members.insert().values({
            'name': request.args['name'][0] + " " + request.args['surname'][0],
            'email': request.args['email'][0],
            'phone': request.args['phone'][0],
            'emergency_phone': request.args['emergency-phone'][0],
            'spam_consent': request.args.get('spam', 'off')[0] == u'on',
            'id_number': request.args['id_no'][0],
            'signature_filename': request.args['filename'][0],
            'show_up_reason': request.args['reason'][0],
            'timestamp': int(time.time()),
        }))
        #thread.start_new_thread(send_email, (request.args['email'],))
        return py.path.local(__file__).join('..', 'web', 'thankyou.html').read().replace("{{foo}}", request.args['filename'][0])

    @methods.POST('^/signup/photo')
    def upload_photo(self, request):
        d = request.content.read()
        print(d)
        prefix = "data:image/png;base64,"
        assert d.startswith(prefix)
        store_dir = get_config().get('data', 'store_dir')
        # invent new filename
        XXXX
        no = list(main.con.execute(select([func.count(members)])))[0][0]
        fname = os.path.join(store_dir, "signature_%d.png" % int(no))
        d = d[len(prefix):]
        if (len(d) % 4) != 0:
            d += "=" * (4 - (len(d) % 4))
        with open(fname, "w") as f:
            f.write(base64.b64decode(d, " /"))
        return fname

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

