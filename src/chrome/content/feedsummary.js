/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Sage.
 *
 * The Initial Developer of the Original Code is
 * Erik Arvidsson <erik@eae.net>.
 * Portions created by the Initial Developer are Copyright (C) 2005
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 * Peter Andrews <petea@jhu.edu>
 * Erik Arvidsson <erik@eae.net>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

Cu.import("resource://sage/SageMetrics.jsm");

const XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";

const URI_CHECK_INTERVAL = 200;
const DEFAULT_CSS = "chrome://sage/skin/feedsummary-content.css";

var strBundleService = Cc["@mozilla.org/intl/stringbundle;1"].getService(Ci.nsIStringBundleService);
var strRes = strBundleService.createBundle("chrome://sage/locale/sage.properties");

var feedSummary = {

  _uri: null,
  _lastUri: null,
  _feedLoader: null,
  _ownFeedLoader: false,
  _resultStrArray: null,
  _logger: null,
  _uriCheckTimer: null,

  get uri() {
    var docFrag = document.location.toString().split("#")[1];
    var params = docFrag.split("/");
    if (params[0] == "feed") {
      return this._uri = decodeURIComponent(params[1]);
    }
    return null;
  },

  get feedLoader() {
    if (this._feedLoader != null) {
      return this._feedLoader;
    }

    // if the sidebar has the same uri then we should reuse that
    var ssb = this.findSageSideBar();
    if (ssb != null && ssb.feedLoader && ssb.feedLoader.uri == this.uri) {
      this._ownFeedLoader = false;
      return this._feedLoader = ssb.feedLoader;
    }
    this._ownFeedLoader = true;
    var fl = this.feedLoader = new FeedLoader;
    return fl
  },

  set feedLoader(fl) {
    if (fl != this._feedLoader) {
      if (this._feedLoader != null) {
        this._feedLoader.removeListener("load", this._onFeedLoad);
        this._feedLoader.removeListener("error", this._onFeedError);
        this._feedLoader.removeListener("abort", this._onFeedAbort);
      }
      this._feedLoader = fl;
    }
    return fl;
  },

  onPageLoad : function(e) {
    // populate the error array
    this._resultStrArray = [
      strRes.GetStringFromName("RESULT_OK_STR"),
      strRes.GetStringFromName("RESULT_PARSE_ERROR_STR"),
      strRes.GetStringFromName("RESULT_NOT_RSS_STR"),
      strRes.GetStringFromName("RESULT_NOT_FOUND_STR"),
      strRes.GetStringFromName("RESULT_NOT_AVAILABLE_STR"),
      strRes.GetStringFromName("RESULT_ERROR_FAILURE_STR")
    ];
    
    var Logger = new Components.Constructor("@sage.mozdev.org/sage/logger;1", "sageILogger", "init");
    this._logger = new Logger();
    
    this._uriCheckTimer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
    this._uriCheckTimer.initWithCallback(this, URI_CHECK_INTERVAL, Ci.nsITimer.TYPE_REPEATING_SLACK);
  },

  onPageUnload : function(e) {
    var fl = this.feedLoader;
    fl.removeListener("load", this.onFeedLoad);
    fl.removeListener("error", this.onFeedError);
    fl.removeListener("abort", this.onFeedAbort);
    this._uriCheckTimer.cancel();
    this._uriCheckTimer = null;
  },
  
  checkUri : function() {
    if (this.uri && this.uri != this._lastUri) {
      this.render();
    }
  },
  
  render : function() {
    var uri = this.uri;
    this._lastUri = uri;
    
    document.title = "Sage";
    document.body.innerHTML = "";
    
    window.scrollTo(0, 0);

    var p = document.createElement("p");
    p.setAttribute("id", "loading-text");
    p.textContent = strRes.formatStringFromName("RESULT_LOADING", [uri], 1);
    document.body.appendChild(p);

    var pb = document.createElementNS(XUL_NS, "progressmeter");
    pb.setAttribute("id", "loading-progress-meter");
    document.body.appendChild(pb);
    pb.setAttribute("mode", "undetermined");
    pb.setAttribute("value", "");

    document.body.setAttribute("class", "loading");
    
    this.loadFeed(uri);
  },

  loadFeed : function(uri) {
    var fl = this.feedLoader;
    if (fl.currentFeed != null) {
      this.onFeedLoad(fl.currentFeed);
    } else {
      fl.addListener("load", this.onFeedLoad);
      fl.addListener("error", this.onFeedError);
      fl.addListener("abort", this.onFeedAbort);
      if (!fl.loading) {
        fl.loadURI(uri);
      }
    }
  },

  onFeedLoad : function(aFeed) {
    var fl = feedSummary.feedLoader
    fl.removeListener("load", feedSummary.onFeedLoad);
    fl.removeListener("error", feedSummary.onFeedError);
    fl.removeListener("abort", feedSummary.onFeedAbort);

    // in case the sidebar started loading some other feed.
    // This should be handled in a better way.
    if (aFeed.getFeedURI() == feedSummary.uri) {
      feedSummary.displayFeed(aFeed);
      document.body.removeAttribute("class");
    } else {
      feedSummary._feedLoader = null;
      feedSummary.loadFeed(feedSummary.uri);
    }
    SageMetrics.view("/feedview");
  },

  onFeedError : function(aErrorCode) {
    var fl = feedSummary.feedLoader
    fl.removeListener("load", feedSummary.onFeedLoad);
    fl.removeListener("error", feedSummary.onFeedError);
    fl.removeListener("abort", feedSummary.onFeedAbort);

    var p = document.getElementById("loading-text");
    p.textContent = strRes.formatStringFromName("RESULT_ERROR", [feedSummary._resultStrArray[aErrorCode]], 1);

    var pb = document.getElementById("loading-progress-meter");
    pb.setAttribute("mode", "determined");
    pb.setAttribute("value", "100%");
    document.body.setAttribute("class", "error");
  },

  onFeedAbort : function() {
    if (feedSummary._ownFeedLoader) {
      feedSummary.loadFeed(feedSummary.uri);
    } else {
      document.body.removeAttribute("class");
    }
  },

  displayFeed : function(feed) {
    document.title = feed.getTitle() + " - Sage";
    
    var allowEContent = SageUtils.getSagePrefValue(SageUtils.PREF_ALLOW_ENCODED_CONTENT);
    var twelveHourClock = SageUtils.getSagePrefValue(SageUtils.PREF_TWELVE_HOUR_CLOCK);
    var parser = Cc["@mozilla.org/feed-unescapehtml;1"].getService(Ci.nsIScriptableUnescapeHTML);
    var dateFormatter = Cc["@sage.mozdev.org/sage/dateformatter;1"].getService(Ci.sageIDateFormatter);
    dateFormatter.setFormat(dateFormatter.FORMAT_LONG, dateFormatter.ABBREVIATED_FALSE, twelveHourClock ? dateFormatter.CLOCK_12HOUR : dateFormatter.CLOCK_24HOUR);
    var content;
    
    var header = document.createElement("div");
    header.setAttribute("id", "rss-header");
    var h1 = document.createElement("h1");
    h1.setAttribute("id", "rss-title");
    var feedLink = document.createElement("a");
    feedLink.setAttribute("id", "rss-link");
    this.setURIAttributeSafe(feedLink, "href", feed.getLink());
    feedLink.appendChild(document.createTextNode(feed.getTitle()));
    h1.appendChild(feedLink);
    header.appendChild(h1);
    if (feed.hasDescription()) {
      var p = document.createElement("p");
      p.setAttribute("id", "rss-desc");
      if (allowEContent) {
        content = feed.getDescription();
      } else {
        content = SageUtils.htmlToText(feed.getDescription());
      }
      p.appendChild(this.sanitizeFragment(parser.parseFragment(content, false, null, document.documentElement), feed.getLink()));
      header.appendChild(p);
    }
    document.body.appendChild(header);
    
    function renderFeedItem(feedItem, index) {
      var item = document.createElement("div");
      item.setAttribute("class", "item");
      var h2 = document.createElement("h2");
      h2.setAttribute("class", "item-title");
      var span = document.createElement("span");
      span.setAttribute("class", "item-ordinal");
      span.appendChild(document.createTextNode((index + 1) + ". " ));
      h2.appendChild(span);
      var a = document.createElement("a");
      this.setURIAttributeSafe(a, "href", feedItem.getLink());
      function getFeedItemTitle(feedItem) {
        if (feedItem.hasTitle()) {
          return feedItem.getTitle();
        } else if (feedItem.getTitle()) {
          return feedItem.getTitle();
        } else {
          return strRes.GetStringFromName("feed_item_no_title");
        }
      }
      a.appendChild(document.createTextNode(getFeedItemTitle(feedItem)));
      h2.appendChild(a);
      item.appendChild(h2);
      if (feedItem.hasContent()) {
        var description = document.createElement("div");
        description.setAttribute("class", "item-desc");
        if (allowEContent) {
          content = feedItem.getContent();
        } else {
          content = SageUtils.htmlToText(feedItem.getContent());
        }
        description.appendChild(this.sanitizeFragment(parser.parseFragment(content, false, null, document.documentElement), feedItem.hasBaseURI() ? feedItem.getBaseURI() : feed.getLink()));
        item.appendChild(description);
      }
      if (feedItem.hasEnclosure()) {
        var enc = feedItem.getEnclosure();
        var enclosure = document.createElement("div");
        enclosure.setAttribute("class", "item-enclosure");
        a = document.createElement("a");
        this.setURIAttributeSafe(a, "href", enc.getLink());
        function createDescriptionFromURL(url) {
          var array = url.split("/");
          var description = "";
          if (array.length > 0) {
            description = array[array.length - 1];
          }
          return description;
        }
        a.setAttribute("title", createDescriptionFromURL(enc.getLink()));
        var img = document.createElement("img");
        img.setAttribute("src", enc.hasMimeType() ? "moz-icon://dummy?size=16&contentType=" + enc.getMimeType() : "chrome://sage/skin/enclosure.png");
        a.appendChild(img);
        a.appendChild(document.createTextNode(strRes.GetStringFromName("feed_summary_enclosure")));
        enclosure.appendChild(a);
        function formatFileSize(n) {
          if (n > 1048576) {
            return Math.round(n / 1048576) + " MB";
          } else if (n > 1024) {
            return Math.round(n / 1024) + " KB";
          } else {
            return n + " B";
          }
        }
        enclosure.appendChild(document.createTextNode(enc.hasLength() ? " (" + formatFileSize(enc.getLength()) + ")" : ""));
        item.appendChild(enclosure);
      }
      if (feedItem.hasPubDate()) {
        var pubdate = document.createElement("div");
        pubdate.setAttribute("class", "item-pubDate");
        pubdate.appendChild(document.createTextNode(dateFormatter.formatDate(feedItem.getPubDate())));
        item.appendChild(pubdate);
      }
      if (feedItem.hasAuthor()) {
        var author = document.createElement("div");
        author.setAttribute("class", "item-author");
        author.appendChild(document.createTextNode(feedItem.getAuthor()));
        item.appendChild(author);
      }
      document.body.appendChild(item);
    }
    
    if (feed.getItemCount() > 0) {
      var items = document.createElement("div");
      items.setAttribute("class", "items");
      var feedItemOrder = SageUtils.getSagePrefValue(SageUtils.PREF_FEED_ITEM_ORDER);
      switch (feedItemOrder) {
        case "chrono": feed.setSort(feed.SORT_CHRONO); break;
        case "source": feed.setSort(feed.SORT_SOURCE); break;
      }
      for (var i = 0; i < feed.getItemCount(); i++) {
        renderFeedItem.call(this, feed.getItem(i), i);
      }
      document.body.appendChild(items);
    }
  },

  findSageSideBar : function() {
    var win = this.findCurrentWindow();
    if (win) {
      var sageBrowser = win.document.getElementById("sidebar");
      if (sageBrowser.getAttribute("src") == "chrome://sage/content/sidebar.xul") {
        return sageBrowser.contentWindow;
      }
    }
    return null;
  },

  findCurrentWindow : function() {
    // for all windows find all browsers and all frames.
    // xul:tabbrowser . browsers

    var windowManager = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);
    var windowManagerInterface = windowManager.QueryInterface(Ci.nsIWindowMediator);

    //var topWindowOfType = windowManagerInterface.getMostRecentWindow( "navigator:browser" );
    var wins = windowManagerInterface.getEnumerator( "navigator:browser" );
    var win, res;
    while (wins.hasMoreElements()) {
      win = wins.getNext();
      win.QueryInterface(Ci.nsIDOMWindow);
      if (this._findInDocument(win.document, document)) {
        return win;
      }
    }
    return null;
  },

  _findInDocument : function(d) {
    var doc = d;
    if (doc == document) {
      return true;
    }

    var frames = d.defaultView.frames;
    var res, i;
    for (i = 0; i < frames.length; i++) {
      res = this._findInDocument(frames[i].document);
      if (res) {
        return true;
      }
    }

    var browsers = doc.getElementsByTagNameNS(XUL_NS, "browser");
    for (i = 0; i < browsers.length; i++) {
      res = this._findInDocument(browsers[i].contentDocument);
      if (res) {
        return true;
      }
    }

    var tabBrowsers = doc.getElementsByTagNameNS(XUL_NS, "tabbrowser");
    for (i = 0; i < tabBrowsers.length; i++) {
      browsers = tabBrowsers[i].browsers;
      for (j = 0; j < browsers.length; j++) {
        res = this._findInDocument(browsers[j].contentDocument);
        if (res) {
          return true;
        }
      }
    }

    return false;
  },
    
  setURIAttributeSafe: function(element, attribute, uri) {
    var secman = Cc["@mozilla.org/scriptsecuritymanager;1"].getService(Ci.nsIScriptSecurityManager);
    var ios = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
    
    const flags = Ci.nsIScriptSecurityManager.DISALLOW_INHERIT_PRINCIPAL;
    
    try {
      feedURI = ios.newURI(this.uri, null, null);
      attrURI = ios.newURI(uri, null, null);
      secman.checkLoadURIWithPrincipal((secman.getSimpleCodebasePrincipal || secman.getCodebasePrincipal)(feedURI), attrURI, flags);  // getCodebasePrincipal renamed in Firefox 17
      element.setAttribute(attribute, attrURI.spec);
    } catch (e) {
      this._logger.error("exception in setURIAttributeSafe: " + e);
    }
  },
  
  decorateAnchorElement: function(element) {
    var ios = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
    var url;
    
    if (element.hasAttribute("href")) {
      try {
        url = ios.newURI(element.getAttribute("href"), null, null).QueryInterface(Ci.nsIURL);
        if (url.host.match(/(.*\.)?amazon\.(com|[a-z]{2}(\.[a-z]{2})?)$/i)) {
          if (!(url.path.match(/-[0-9]{2}$/i) || url.path == "/" || url.query.match(/(^|&)tag=/i))) {
            url.query += (url.query == "" ? "" : "&") + "tag=sagerss-20";
            element.setAttribute("href", url.spec);
          }
        }
      } catch(e) { }
    }
  },
  
  sanitizeFragment: function(fragment, baseURI) {
    var walker = document.createTreeWalker(fragment, Ci.nsIDOMNodeFilter.SHOW_ELEMENT, null, false);
    var elem, attrName, attr, value;
    
    const URIFixup = Components.classes["@mozilla.org/docshell/urifixup;1"].getService(Ci.nsIURIFixup);
    
    const URI_ATTR_LIST = ["action", "href", "src", "longdesc", "usemap", "cite", "background"];
    
    while (walker.nextNode()) {
      elem = walker.currentNode;
      for each (attrName in URI_ATTR_LIST) {
        attr = elem.attributes.getNamedItem(attrName);
        if (attr) {
          value = elem.getAttribute(attrName);
          elem.removeAttribute(attrName);
          if (baseURI) {
            try {
              value = URIFixup.createFixupURI(baseURI, Ci.nsIURIFixup.FIXUP_FLAG_NONE).resolve(value);
            } catch (e) {
              this._logger.warn("Unable to resolve link: " + value + " using base: " + baseURI);
            }
          }
          this.setURIAttributeSafe(elem, attrName, value);
        }
      }
      if (elem.tagName.toLowerCase() == "a") {
        this.decorateAnchorElement(elem);
      }
    }
    
    return fragment;
  },
  
  getUserCssURL : function() {
    var cssUrl = DEFAULT_CSS;
    var userCssEnable = SageUtils.getSagePrefValue(SageUtils.PREF_USER_CSS_ENABLE);
    var userCssPath = SageUtils.getSagePrefValue(SageUtils.PREF_USER_CSS_PATH);
    if (userCssEnable && userCssPath) {
      var ioService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
      var tmpFile = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile);
      try {
        tmpFile.initWithPath(userCssPath);
        var fileUrl = ioService.newFileURI(tmpFile);
        cssUrl = fileUrl.spec;
      } catch(e) { }
    }
    return cssUrl;
  },
  
  // nsITimerCallback
  notify : function(aTimer) {
    if (aTimer == this._uriCheckTimer) {
      this.checkUri();
    }
  },
  
  // nsIDOMEventListener
  handleEvent: function(event) {
    switch(event.type) {
      case "load":
        this.onPageLoad(event);
        break;
      case "unload":
        this.onPageUnload(event);
        break;
    }
  }

};

// set feed style sheet before content loads
var headEl = document.getElementsByTagName("head")[0];
var linkEl = document.createElement("link");
linkEl.setAttribute("rel", "stylesheet");
linkEl.setAttribute("type", "text/css");
linkEl.setAttribute("href", feedSummary.getUserCssURL());
headEl.appendChild(linkEl);

window.addEventListener("load", feedSummary, false);
window.addEventListener("unload", feedSummary, false);
