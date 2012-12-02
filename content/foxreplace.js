/* ***** BEGIN LICENSE BLOCK *****
 *   Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version 1.1 (the "License"); you may not use this file except in compliance with the
 * License. You may obtain a copy of the License at http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis, WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License for the
 * specific language governing rights and limitations under the License.
 *
 * The Original Code is FoxReplace.
 *
 * The Initial Developer of the Original Code is Marc Ruiz Altisent.
 * Portions created by the Initial Developer are Copyright (C) 2007-2012 the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 * Lutay Sergey (href substitution)
 *
 * Alternatively, the contents of this file may be used under the terms of either the GNU General Public License Version 2 or later (the "GPL"), or the GNU
 * Lesser General Public License Version 2.1 or later (the "LGPL"), in which case the provisions of the GPL or the LGPL are applicable instead of those above.
 * If you wish to allow use of your version of this file only under the terms of either the GPL or the LGPL, and not to allow others to use your version of this
 * file under the terms of the MPL, indicate your decision by deleting the provisions above and replace them with the notice and other provisions required by
 * the GPL or the LGPL. If you do not delete the provisions above, a recipient may use your version of this file under the terms of any one of the MPL, the GPL
 * or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

/**
 * Main object of the FoxReplace extension. It performs the substitutions and manages the main UI.
 */
var foxreplace = {

  core: {},

  /**
   * Initialization code.
   */
  onLoad: function() {
    //document.getElementById("contentAreaContextMenu").addEventListener("popupshowing", function() { foxreplace.onShowContextMenu(); }, false);

    this.prefs.service.addObserver("", this, false);

    gBrowser.addEventListener("DOMContentLoaded", this.onPageLoad, true);

    this._loadEnabledGroups();
    this.setAutoReplaceOnLoad(this.prefs.autoReplaceOnLoad);

    // subscription
    var enableSubscription = this.prefs.enableSubscription;
    var subscriptionUrl = this.prefs.subscriptionUrl;
    var subscriptionPeriod = this.prefs.subscriptionPeriod;

    if (enableSubscription && subscriptionUrl && subscriptionPeriod > 0)
      fxrSubscription.start(subscriptionUrl, subscriptionPeriod);
  },

  /**
   * Finalization code.
   */
  onUnload: function() {
    this.prefs.service.removeObserver("", this);
  },

  /**
   * Observes changes in preferences.
   */
  observe: function(aSubject, aTopic, aData) {
    // aSubject is the nsIPrefBranch we're observing (after appropriate QI)
    // aData is the name of the pref that's been changed (relative to aSubject)

    if (aTopic != "nsPref:changed") return;

    switch (aData) {
      case "substitutionListJSON":
        this._loadEnabledGroups();
        break;

      case "autoReplaceOnLoad":
        this.setAutoReplaceOnLoad(this.prefs.autoReplaceOnLoad);
        break;

      case "enableSubscription":
      case "subscriptionUrl":
      case "subscriptionPeriod":
        var enableSubscription = this.prefs.enableSubscription;
        var subscriptionUrl = this.prefs.subscriptionUrl;
        var subscriptionPeriod = this.prefs.subscriptionPeriod;
        if (enableSubscription && subscriptionUrl && subscriptionPeriod > 0)
          fxrSubscription.restart(subscriptionUrl, subscriptionPeriod);
        else
          fxrSubscription.stop();
        break;
    }
  },

  /**
   * Sets auto-replace on load setting.
   */
  setAutoReplaceOnLoad: function(aAutoReplaceOnLoad) {
    document.getElementById("fxrMenuToolsFoxReplaceAutoReplaceOnLoad").setAttribute("checked", aAutoReplaceOnLoad);
    let appMenuItem = document.getElementById("fxrAppMenuReplaceAutoReplaceOnLoad");
    if (appMenuItem) appMenuItem.setAttribute("checked", aAutoReplaceOnLoad);
    var menuItem = document.getElementById("fxrToolbarButtonMenuAutoReplaceOnLoad");
    if (menuItem) menuItem.setAttribute("checked", aAutoReplaceOnLoad);

    this._autoReplaceOnLoad = aAutoReplaceOnLoad;
  },

  /**
   * Shows the replace bar.
   */
  showReplaceBar: function() {
    var replaceBar = document.getElementById("fxrReplaceBar");
    replaceBar.hidden = false;
    // without the timeout it doesn't get the focus
    window.setTimeout(function() {
      document.getElementById("fxrReplaceBarInputStringTextBox").focus();
    }, 100);
  },

  /**
   * Applies the substitution entered by the user in the replace bar.
   */
  instantReplace: function() {
    var inputString = document.getElementById("fxrReplaceBarInputStringTextBox").value;
    var inputType = document.getElementById("fxrReplaceBarInputStringTextBox").inputType;
    var outputString = document.getElementById("fxrReplaceBarOutputStringTextBox").value;
    var caseSensitive = document.getElementById("fxrReplaceBarCaseSensitiveCheckBox").checked;
    var html = document.getElementById("fxrReplaceBarHtmlCheckBox").checked;

    if (inputString == "") return;  // this should not happen

    try {
      // new temporal substitution list with only one item
      this._substitutionList = [new this.core.SubstitutionGroup("", [], [new this.core.Substitution(inputString, outputString, caseSensitive, inputType)], html,
                                                                true)];
      // perform substitutions
      this.replaceDocXpath();
    }
    catch (se) {  // SyntaxError
      this.prompts.alert(this.getLocalizedString("regExpError"), se);
    }

    // restore substitution list
    this._loadEnabledGroups();
  },

  /**
   * Applies substitutions from the substitution list.
   */
  listReplace: function() {
    this.replaceDocXpath();
  },

  /**
   * Toggles auto-replace on load setting.
   */
  toggleAutoReplaceOnLoad: function() {
    this.prefs.autoReplaceOnLoad = !this.prefs.autoReplaceOnLoad;
  },

  /**
   * Shows options dialog.
   */
  showOptions: function() {
    window.openDialog("chrome://foxreplace/content/options.xul", "", "chrome,titlebar,toolbar,centerscreen,modal");
  },

  /**
   * Shows help file in a new tab.
   */
  showHelp: function() {
    // Add tab, then make active
    gBrowser.selectedTab = gBrowser.addTab("chrome://foxreplace/content/help.xhtml");
  },

  /**
   * Applies substitutions from the substitution list to the loaded page if auto-replace on load is on.
   */
  onPageLoad: function(aEvent) {
    if (!foxreplace._autoReplaceOnLoad) return;

    // doc is the document that triggered "onload" event
    var doc = aEvent.originalTarget;
    if (doc.nodeName != "#document") return;

    // perform substitutions on the loaded document
    foxreplace.replaceDocXpath(doc.defaultView);
  },

  /**
   * Performs susbstitutions from the substitution list in the passed window. If no window is passed the current window is the target.
   */
  replaceDocXpath: function(aWindow) {
    if (!aWindow) aWindow = window.content;

    if (aWindow.frames.length > 0) {
      var nFrames = aWindow.frames.length;
      for (var i = 0; i < nFrames; i++) this.replaceDocXpath(aWindow.frames[i]);
    }

    var doc = aWindow.document;
    if (!doc || !("body" in doc)) return;

    var url = doc.URL;
    if (!url) return;
    var nSubstitutions = this._substitutionList.length;

    for (var j = 0; j < nSubstitutions; j++) {
      var group = this._substitutionList[j];

      if (!group.matches(url)) continue;

      if (group.html) this.replaceHtml(doc, group);
      else this.replaceText(doc, group);
    }
  },

  /**
   * Applies substitutions from aGroup to aDocument on text.
   */
  replaceText: function(aDocument, aGroup) {
    // selection string possibilities
    /* ... empty(index-of(('style'),lower-case(name(parent::*))))  :( functions not supported */
    /* //body//text()[string-length(normalize-space())>0] */

    // TODO any other xml document won't be replaced

    // Replace text nodes
    var textNodesXpath = "/html/head/title/text()"
                       + "|/html/body//text()[not(parent::script)]";
    var textNodes = aDocument.evaluate(textNodesXpath, aDocument, null, XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE, null);
    var nTextNodes = textNodes.snapshotLength;
    for (var i = 0; i < nTextNodes; i++) {
      var textNode = textNodes.snapshotItem(i);
      textNode.textContent = aGroup.replace(textNode.textContent);
    }

    // Replace nodes with a "value" property
    var valueNodesXpath = "/html/body//input[@type='text']"
                        + "|/html/body//textarea"
                        + "|/html/body//@abbr"
                        + "|/html/body//@abbr"
                        + "|/html/body//@alt"
                        + "|/html/body//@label"
                        + "|/html/body//@standby"
                        + "|/html/body//@summary"
                        + "|/html/body//@title"
                        + "|/html/body//input[@type!='hidden']/@value"
                        + "|/html/body//option/@value"
                        + "|/html/body//button/@value";
    if (this.prefs.replaceUrls) {
      valueNodesXpath += "|/html/body//a/@href"
                       + "|/html/body//img/@src";
    }
    var valueNodes =
        aDocument.evaluate(valueNodesXpath, aDocument, null, XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE, null);
    var nValueNodes = valueNodes.snapshotLength;
    for (var i = 0; i < nValueNodes; i++) {
      var valueNode = valueNodes.snapshotItem(i);

      // Special treatment for textareas that still have their default value (issue 63)
      if (valueNode.type == "textarea" && valueNode.value == valueNode.defaultValue) continue;

      valueNode.value = aGroup.replace(valueNode.value);
    }

    // Replace scripts
    if (this.prefs.replaceScripts) {
      let scriptNodesXpath = "/html/body/script";
      let scriptNodes = aDocument.evaluate(scriptNodesXpath, aDocument, null, XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE, null);
      let nScriptNodes = scriptNodes.snapshotLength;
      for (let i = 0; i < nScriptNodes; i++) {
        let scriptNode = scriptNodes.snapshotItem(i);
        let newText = aGroup.replace(scriptNode.text);
        if (newText != scriptNode.text) this._replaceScript(aDocument, scriptNode, newText);
      }
    }
  },

  /**
   * Applies substitutions from aGroup to aDocument on HTML.
   */
  replaceHtml: function(aDocument, aGroup) {
    var body = aDocument.evaluate("/html/body", aDocument, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
    body.singleNodeValue.innerHTML = aGroup.replace(body.singleNodeValue.innerHTML);

    // Replace scripts
    if (this.prefs.replaceScripts) {
      let scriptNodesXpath = "/html/body/script";
      let scriptNodes = aDocument.evaluate(scriptNodesXpath, aDocument, null, XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE, null);
      let nScriptNodes = scriptNodes.snapshotLength;
      for (let i = 0; i < nScriptNodes; i++) {
        let scriptNode = scriptNodes.snapshotItem(i);
        this._replaceScript(aDocument, scriptNode, scriptNode.text);
        // scriptNode.text is already the replaced code, but scriptNode still executes the old code, so a new script node has to be created for the change to
        // really work
      }
    }
  },

  /**
   * Replaces aScript within aDocument with a new one with aNewCode.
   */
  _replaceScript: function(aDocument, aScript, aNewCode) {
    let newScript = aDocument.createElement("script");
    let attributes = aScript.attributes;
    let nAttributes = attributes.length;
    for (let i = 0; i < nAttributes; i++) newScript.setAttribute(attributes[i].name, attributes[i].value);
    newScript.text = aNewCode;
    aScript.parentNode.replaceChild(newScript, aScript);
  },

  /**
   * Loads enabled substitution groups.
   */
  _loadEnabledGroups: function() {
    this._substitutionList = this.prefs.substitutionList.filter(function(aGroup) { return aGroup.enabled; });
  }

};

Components.utils.import("resource://foxreplace/core.js", foxreplace.core);
Components.utils.import("resource://foxreplace/subscription.js");
Components.utils.import("resource://foxreplace/prefs.js", foxreplace);
Components.utils.import("resource://foxreplace/services.js", foxreplace);

window.addEventListener("load", function() { foxreplace.onLoad(); }, false);
window.addEventListener("unload", function() { foxreplace.onUnload(); }, false);
