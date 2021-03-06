/**
 * Created by Hey on 13 Jun 2017
 */
var test = require('chai');
var format = require('string-format');

var sinon = require('sinon');
var sinonTest = require('sinon-test');
sinon.test = sinonTest.configureTest(sinon);
sinon.testCase = sinonTest.configureTestCase(sinon);

var urlShortenerMicroservice = require('../urlShortenerMicroservice');
var shortenedUrlPersister = require('../shortenedUrlPersister');

describe("urlShortenerMicroservice", function () {
    var aFullHostName = "http://www.somehost.com";

    it("should be able to get MONGO_URL from .env", function () {
        //    given
        //    when
        var mongoUrl = process.env.MONGO_URL;

        //    then
        test.expect(mongoUrl).to.be.not.undefined;
    });

    describe("With stubbing", function () {
        var stub;
        afterEach(function () {
            if (typeof stub !== 'undefined') {
                stub.restore();
            }
        });

        function assertPromise(promise) {
            function assertFieldAbsence(jsonResponse, field) {
                test.expect(field in jsonResponse).to.be.false;
                return jsonResponse;
            }

            function assertFieldValue(jsonResponse, field, value) {
                test.expect(jsonResponse[field]).to.equal(value);
                return jsonResponse;
            }

            return {
                "withoutError": function () {
                    return {
                        "andResponseIs": function (from, to) {
                            return promise.then(function (jsonResponse) {
                                assertFieldAbsence(jsonResponse, "error");
                                assertFieldValue(jsonResponse, "shortened_from", from);
                                assertFieldValue(jsonResponse, "shortened_to", to);
                                return jsonResponse
                            });
                        }
                    }
                },
                "withError": function () {
                    return {
                        "andErrorMessageIs": function (errorMeassage) {
                            return promise.then(function (jsonResponse) {
                                assertFieldValue(jsonResponse, "error", errorMeassage);
                                assertFieldAbsence(jsonResponse, 'shortened_from');
                                assertFieldAbsence(jsonResponse, 'shortened_to');
                                return jsonResponse
                            });
                        }
                    }
                }
            };
        }

        describe("Shortening URL", function () {
            describe("invalid URL", function () {
                it("should throw error for invalid URL that does not follow the valid http://www.example.com format", function () {
                    //    given
                    var anInvalidUrl = "some invalid url";

                    //    when
                    var promise = urlShortenerMicroservice.tryShortening(anInvalidUrl, aFullHostName);

                    //    then
                    return assertPromise(promise)
                        .withError()
                        .andErrorMessageIs(format("'{}' is not a valid url that follow the format 'http://www.example.com'", anInvalidUrl));
                });
            });

            describe("valid URL", function () {
                [
                    "short",
                    "another"
                ].forEach(function (shortenedUrl) {
                    it("should try to shorten valid URL and return that as json response", function () {
                        //    given
                        var aValidUrl = "http://www.example.com";
                        stub = stubPersistOrReturnExisting().to.resolve.withHostNameAppendedTo(shortenedUrl);

                        //    when
                        var promise = urlShortenerMicroservice.tryShortening(aValidUrl, aFullHostName);

                        //    then
                        return assertPromise(promise)
                            .withoutError()
                            .andResponseIs(aValidUrl, aFullHostName.concat(shortenedUrl));
                    });
                });

                it("should catch any error thrown from the promise and return error message as json response", function () {
                    //    given
                    var aValidUrl = "http://www.example.com";
                    var errMessage = 'some error';
                    stub = stubPersistOrReturnExisting().to.call(function () {
                        return new Promise(function () {
                            throw new Error(errMessage);
                        }).catch(function (err) {
                            throw err;
                        });
                    });

                    //    when
                    var promise = urlShortenerMicroservice.tryShortening(aValidUrl, aFullHostName);

                    //    then
                    return assertPromise(promise)
                        .withError()
                        .andErrorMessageIs(format("Unable to shorten url, reason: {}", errMessage));
                });
            });
        });

        describe("Shortening any string", function () {
            it("should shorten any string for the shortenAny API and return that as JSON response", function () {
                //    given
                var someRandomString = "someRandomString", shortenedUrl = "short";
                stub = stubPersistOrReturnExisting().to.resolve.withHostNameAppendedTo(shortenedUrl);

                //    when
                var promise = urlShortenerMicroservice.shortenAny(someRandomString, aFullHostName);

                //    then
                return assertPromise(promise)
                    .withoutError()
                    .andResponseIs(someRandomString, aFullHostName.concat(shortenedUrl));
            });
        });

        describe("Retrieving URL", function () {
            describe("shortened URL found", function () {
                it('shoule retrieve original url if the given shortened url exists', function () {
                    //    given
                    var hostname = "https://myhost.com";
                    var urlParam = "short";
                    var originalUrlUrl = "http://www.original.com";
                    stub = stubShortenedUrlPersister(function () {
                        return Promise.resolve(originalUrlUrl);
                    }, "search");

                    //    when
                    var promise = urlShortenerMicroservice.searchForOriginalUrl(urlParam, hostname);

                    //    then
                    return promise.then(function (url) {
                        test.expect(url['shorten_from']).to.equal(originalUrlUrl);
                        test.expect('error' in url).to.equal(false);
                    });
                });
            });

            describe("shortened URL not found", function () {
                it('shoule return error with error message if the given shortened url does not exist', function () {
                    //    given
                    var hostname = "https://myhost.com";
                    var urlParam = "short";
                    var originalUrlUrl = "http://www.original.com";
                    var errorMessage = urlParam.concat(" not found");
                    stub = stubShortenedUrlPersister(function () {
                        return new Promise(function () {
                            throw new Error(errorMessage);
                        });
                    }, "search");

                    //    when
                    var promise = urlShortenerMicroservice.searchForOriginalUrl(urlParam, hostname);

                    //    then
                    return promise.then(function (err) {
                        test.expect(err.error).to.equal(errorMessage);
                        test.expect('shorten_from' in err).to.equal(false);
                    })
                });
            });
        });

        function stubShortenedUrlPersister(mockGetPromiseFor, method) {
            var stub = sinon.stub(shortenedUrlPersister.getPromiseFor, method);
            stub.callsFake(mockGetPromiseFor);
            return stub;
        }

        function stubPersistOrReturnExisting() {
            return {
                "to": {
                    "resolve": {
                        "withHostNameAppendedTo": function (shortenedUrl) {
                            return stubShortenedUrlPersister(function (url, hostName) {
                                return Promise.resolve(hostName.concat(shortenedUrl));
                            }, "persistOrReturnExisting");
                        }
                    },
                    "call": function (action) {
                        return stubShortenedUrlPersister(action, "persistOrReturnExisting");
                    }
                }
            };
        }
    });
});