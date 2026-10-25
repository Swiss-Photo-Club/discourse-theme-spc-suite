#!/usr/bin/python3
"""Send maintenance alerts without depending on the Discourse container."""
import json
import smtplib
import ssl
import subprocess
import sys
from email.message import EmailMessage

with open('/etc/spc-discourse-alert.json') as source:
    config = json.load(source)

test = sys.argv[1:] == ['--test']
if not test:
    # A failed bootstrap leaves the previous container available to start again.
    subprocess.run(['docker', 'start', 'app'], timeout=120, check=False)

message = EmailMessage()
message['From'] = config['from']
message['To'] = config['to']
message['Subject'] = ('[TEST] Discourse overnight update alerts configured' if test
                      else '[ACTION REQUIRED] SPC Discourse overnight update failed')
message.set_content(
    'Forum: https://community.swissphotoclub.com\n'
    'Schedule: Monday and Thursday at 03:00 Europe/Zurich, with a full backup before rebuilding.\n\n'
    + ('This is a delivery test. No upgrade has been started.\n' if test else
       'The backup, upgrade, or health check failed. The existing container was asked to start.\n'
       'Check the forum and SSH to spc-discourse. Inspect:\n'
       'journalctl -u spc-discourse-update.service\n'
       'Backups: /var/discourse/shared/standalone/backups/default\n')
)
smtp = config['smtp']
implicit_tls = smtp.get('ssl') or smtp.get('tls')
client = smtplib.SMTP_SSL if implicit_tls else smtplib.SMTP
kwargs = {'context': ssl.create_default_context()} if implicit_tls else {}
with client(smtp['address'], int(smtp.get('port', 587)), timeout=30, **kwargs) as connection:
    connection.ehlo(smtp.get('domain') or 'community.swissphotoclub.com')
    if not implicit_tls:
        # Never send the SMTP credentials over an unencrypted connection.
        connection.starttls(context=ssl.create_default_context())
        connection.ehlo(smtp.get('domain') or 'community.swissphotoclub.com')
    if smtp.get('user_name'):
        connection.login(smtp['user_name'], smtp['password'])
    connection.send_message(message)
print('Alert email accepted by SMTP server for ' + config['to'])
