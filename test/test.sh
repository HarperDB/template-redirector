TOKEN=`printf "$CLI_TARGET_USERNAME:$CLI_TARGET_PASSWORD" | openssl enc -base64 -A`
AUTH="Authorization: Basic $TOKEN"
CURL="curl -s"
HOST=127.0.0.1
SCHEME=http
CT_JSON='Content-type: application/json'
CT_CSV='Content-type: text/csv'

# This just makes the command line happy when you do not want to send and auth header
AUTH="Noauth: None"

out=`$CURL --header "$AUTH" --header "$CT_JSON" $SCHEME://$HOST:9926/redirect -d @data/example.json`
echo $out

out=`$CURL --header "$AUTH" --header "$CT_CSV" $SCHEME://$HOST:9926/redirect --data-binary @data/example.csv`
echo $out

out=`$CURL --header "$AUTH" $SCHEME://$HOST:9926/checkredirect?path=/p/shoes/`
echo $out

out=`$CURL --header "$AUTH" $SCHEME://$HOST:9926/checkredirect?path=https://www.foo.com/p/shoes/`
echo $out

out=`$CURL --header "$AUTH" $SCHEME://$HOST:9926/checkredirect --header 'Path: /p/shoes/'`
echo $out

out=`$CURL --header "$AUTH" $SCHEME://$HOST:9926/checkredirect --header 'Path: https://www.foo.com/p/shoes/'`
echo $out

out=`$CURL --header "$AUTH" $SCHEME://$HOST:9926/rule`
echo $out

out=`$CURL -X DELETE --header "$AUTH" $SCHEME://$HOST:9926/rule/?path==*`
echo $out

out=`$CURL --header "$AUTH" $SCHEME://$HOST:9926/rule`
echo $out

out=`$CURL --header "$AUTH" $SCHEME://$HOST:9926/checkredirect?path=/p/shoes/`
echo $out
