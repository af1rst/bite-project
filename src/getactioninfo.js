// Copyright 2010 Google Inc. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * @fileoverview This file contains content script for
 * recording and validation.
 *
 * @author phu@google.com (Po Hu)
 */

goog.provide('rpf.ContentScript.RecordHelper');

goog.require('Bite.Constants');
goog.require('bite.client.Container');
goog.require('bite.client.Templates');
goog.require('bite.rpf.BotHelper');
goog.require('common.client.ElementDescriptor');
goog.require('element.helper.Templates.locatorsUpdater');
goog.require('goog.Timer');
goog.require('goog.Uri');
goog.require('goog.dom');
goog.require('goog.dom.TagName');
goog.require('goog.events');
goog.require('goog.events.EventHandler');
goog.require('goog.events.KeyCodes');
goog.require('goog.style');



/**
 * The helper class for recording.
 * @param {boolean=} opt_noConsole Whether no rpf Console UI is constructed.
 * @constructor
 * @export
 */
rpf.ContentScript.RecordHelper = function(opt_noConsole) {
  /**
   * The current element under cursor.
   * @type {Element}
   * @private
   */
  this.elemUnderCursor_ = null;

  /**
   * The outline style of the current selected element.
   * @type {string}
   * @private
   */
  this.outlineOfCurrentElem_ = '';

  /**
   * The current element with mouse down.
   * @type {Element}
   * @private
   */
  this.curMouseDownElement_ = null;

  /**
   * The recording mode.
   * @type {string}
   * @private
   */
  this.recordingMode_ = '';

  /**
   * Whether to show attributes.
   * @type {boolean}
   * @private
   */
  this.hoverToShowAttr_ = true;

  /**
   * Manages the UI listeners for the locator finder.
   * @type {goog.events.EventHandler}
   * @private
   */
  this.attrEventHandler_ = new goog.events.EventHandler(this);

  /**
   * The original contextmenu handler.
   * @type {function()|null}
   * @private
   */
  this.originalContextMenu_ = null;

  /**
   * The element's cursor position object.
   * @type {Object}
   */
  this.currentElemCursorPos = {'x': 0, 'y': 0};

  /**
   * Whether operation is done without rpf Console UI (true) or not (false).
   * @type {boolean}
   * @private
   */
  this.noConsole_ = !!opt_noConsole;

  /**
   * The element descriptor instance.
   * @type {common.client.ElementDescriptor}
   * @private
   */
  this.elemDescriptor_ = new common.client.ElementDescriptor();

  /**
   * The element in locator finder.
   * @type {Element}
   * @private
   */
  this.elemInLocatorFinder_ = null;

  /**
   * The element and xpath mapper.
   * @type {!Object}
   * @private
   */
  this.elementXpathMap_ = {};

  /**
   * The mousedown event handler.
   * @type {function(Event)}
   * @private
   */
  this.onMouseDownHandler_ = goog.bind(this.mouseDownHandler_, this);

  /**
   * The mouseover event handler.
   * @type {function(Event)}
   * @private
   */
  this.onMouseOverHandler_ = goog.bind(this.mouseOverHandler_, this);

  /**
   * The mouseout event handler.
   * @type {function(Event)}
   * @private
   */
  this.onMouseOutHandler_ = goog.bind(this.mouseOutHandler_, this);

  /**
   * The onchange event handler.
   * @type {function(Event)}
   * @private
   */
  this.onChangeHandler_ = goog.bind(this.changeHandler_, this);

  /**
   * The onsubmit event handler.
   * @type {function(Event)}
   * @private
   */
  this.onSubmitHandler_ = goog.bind(this.submitHandler_, this);

  /**
   * The keydown event handler.
   * @type {function(Event)}
   * @private
   */
  this.onKeyDownHandler_ = goog.bind(this.keyDownHandler_, this);

  /**
   * The dblclick event handler.
   * @type {function(Event)}
   * @private
   */
  this.onDblClickHandler_ = goog.bind(this.dblClickHandler_, this);

  /**
   * The mouseup event handler.
   * @type {function(Event)}
   * @private
   */
  this.onMouseUpHandler_ = goog.bind(this.mouseUpHandler_, this);

  /**
   * The xpath finder console.
   * @type {bite.client.Container}
   * @private
   */
  this.finderConsole_ = null;

  this.testest = new bite.rpf.BotHelper();
};


/**
 * The max index.
 * @type {number}
 * @private
 */
rpf.ContentScript.RecordHelper.MAX_ = 999;


/**
 * Opens the locator helper dialog.
 * TODO(phu): Move the bite console to common lib and call it directly.
 * @private
 */
rpf.ContentScript.RecordHelper.prototype.openLocatorDialog_ = function() {
  if (goog.dom.getElement('bite-locator-console-container')) {
    this.finderConsole_.show();
    return;
  }
  this.finderConsole_ = new bite.client.Container(
      '', 'bite-locator-console-container',
      'Xpath Finder (Press Shift to pause&resume Xpath changes)',
      '', true);
  this.finderConsole_.setContentFromHtml(
      element.helper.Templates.locatorsUpdater.showHelperContent({}));
  var size = goog.dom.getViewportSize();
  this.finderConsole_.updateConsolePosition(
      {'position': {'x': size.width - 535,
                    'y': size.height - 345},
       'size': {'width': 530,
                'height': 340}});
  this.registerAncestorEvents_();
  this.registerOnClose_();
};


/**
 * Registers on close event for xpath finder.
 * @private
 */
rpf.ContentScript.RecordHelper.prototype.registerOnClose_ = function() {
  var hideConsole = goog.dom.getElementByClass(
      'bite-close-button',
      this.finderConsole_.getRoot());
  if (hideConsole) {
    goog.events.listen(
        hideConsole, goog.events.EventType.CLICK,
        goog.bind(this.hideFinderConsole_, this));
  }
};


/**
 * Hides the finder console.
 * @private
 */
rpf.ContentScript.RecordHelper.prototype.hideFinderConsole_ = function() {
  this.finderConsole_.hide();
};


/**
 * The handler for saving a specified selector.
 * @private
 */
rpf.ContentScript.RecordHelper.prototype.onSaveSelector_ = function() {
  var xpath = goog.dom.getElement('cssSelectorInput').value;
  var defaultXpath = this.elemDescriptor_.generateXpath(
      this.elemInLocatorFinder_, {'id': null}, {'id': null});
  this.elementXpathMap_[defaultXpath] = xpath;
  this.finderConsole_.showInfoMessage('The new xpath was saved.', 2);
};


/**
 * The handler for pinging a specified selector.
 * TODO(phu): This also should call a common lib function to ping.
 * @private
 */
rpf.ContentScript.RecordHelper.prototype.onPingSelector_ = function() {
  var xpath = goog.dom.getElement('cssSelectorInput').value;
  var doc = goog.dom.getDocument();
  try {
    var elems = doc.evaluate(xpath, doc, null, XPathResult.ANY_TYPE, null);
    var firstR = elems.iterateNext();
    firstR.style.outline = 'medium solid blue';
    goog.Timer.callOnce(function() {firstR.style.outline = '';}, 1500);
  } catch (e) {
    console.log('Failed to find elements through xpath ' + xpath);
  }
};


/**
 * Registers all of the attribute checkboxes of the ancestors.
 * @private
 */
rpf.ContentScript.RecordHelper.prototype.registerAncestorEvents_ = function() {
  goog.events.listen(
      goog.dom.getElement('saveSelector'),
      'click',
      goog.bind(this.onSaveSelector_, this));
  goog.events.listen(
      goog.dom.getElement('pingSelector'),
      'click',
      goog.bind(this.onPingSelector_, this));
  var elems = goog.dom.getDocument().getElementsByName('ancestorLocatorCheck');
  for (var i = 0, len = elems.length; i < len; ++i) {
    goog.events.listen(
        elems[i], 'click', goog.bind(this.checkboxHandler_, this));
  }
};


/**
 * Registers all of the attribute checkboxes of the element.
 * @private
 */
rpf.ContentScript.RecordHelper.prototype.registerElementEvents_ = function() {
  var elems = goog.dom.getDocument().getElementsByName('elementLocatorCheck');
  var contains = goog.dom.getDocument().getElementsByName('elementContain');
  for (var i = 0, len = elems.length; i < len; ++i) {
    this.attrEventHandler_.listen(
        elems[i], 'click', goog.bind(this.checkboxHandler_, this));
    this.attrEventHandler_.listen(
        contains[i], 'click', goog.bind(this.checkboxHandler_, this));
  }
};


/**
 * Gets the checkbox value array of a given element name.
 * @param {string} name The element name.
 * @return {Object.<string, Object>} The key is the element's attribute and
 *     the value is an object which contains the attribute's value and whether
 *     the value should be exact or contained.
 * @private
 */
rpf.ContentScript.RecordHelper.prototype.getValueArr_ = function(name) {
  var elems = goog.dom.getDocument().getElementsByName(name);
  var results = {};
  for (var i = 0, len = elems.length; i < len; ++i) {
    if (elems[i].checked) {
      var attr = elems[i].value;
      if (!goog.dom.getElement('value' + attr)) {
        results[attr] = null;
      } else {
        var value = goog.dom.getElement('value' + attr).value;
        var isExact = !goog.dom.getElement('contains' + attr).checked;
        results[attr] = {'value': value, 'isExact': isExact};
      }
    }
  }
  return results;
};


/**
 * Handlers for all of the attribute checkboxes.
 * @param {Event} e The event object.
 * @private
 */
rpf.ContentScript.RecordHelper.prototype.checkboxHandler_ = function(e) {
  goog.dom.getElement('cssSelectorInput').value =
      this.elemDescriptor_.generateXpath(
          this.elemInLocatorFinder_,
          this.getValueArr_('ancestorLocatorCheck'),
          this.getValueArr_('elementLocatorCheck'));
};


/**
 * Shows the locator finding methods in helper dialog.
 * @private
 */
rpf.ContentScript.RecordHelper.prototype.showLocatorMethods_ = function() {
  if (!this.hoverToShowAttr_) {
    return;
  }
  this.elemInLocatorFinder_ = this.elemUnderCursor_;
  var attrs = common.client.ElementDescriptor.getAttributeArray(
      this.elemUnderCursor_);
  soy.renderElement(
      goog.dom.getElement('locatorMethodsTable'),
      element.helper.Templates.locatorsUpdater.showMethodsContent,
      {'data': attrs});

  var xpath = this.elemDescriptor_.generateXpath(
      this.elemInLocatorFinder_, {'id': null}, {'id': null});
  if (this.elementXpathMap_[xpath]) {
    xpath = this.elementXpathMap_[xpath];
  }
  goog.dom.getElement('cssSelectorInput').value = xpath;
  this.attrEventHandler_.removeAll();
  this.registerElementEvents_();
};


/**
 * Creates a variable name to an element.
 * @param {Object} elem The element.
 * @param {number=} opt_maxLen The maximum length.
 * @return {string} The generated unique variable name.
 * @private
 */
rpf.ContentScript.RecordHelper.prototype.createVarName_ = function(
    elem, opt_maxLen) {
  var maxLen = opt_maxLen || 10;
  var url = goog.dom.getDocument().URL.replace(/\W+/g, '');
  var starts = 0;
  if (url.length > maxLen) {
    starts = url.length - maxLen;
  }
  return (elem.tagName + this.getElemIndexWithSameTag_(elem) +
          '-' + rpf.ContentScript.RecordHelper.randomInt());
};


/**
 * Gets the index of the element within all the elements having the same
 * tag name.
 * @param {Object} elem The input element.
 * @return {number} The index.
 * @private
 */
rpf.ContentScript.RecordHelper.prototype.getElemIndexWithSameTag_ =
    function(elem) {
  var elemsWithSameTag = goog.dom.getElementsByTagNameAndClass(elem.tagName);
  for (var i = 0; i < elemsWithSameTag.length; i++) {
    if (elemsWithSameTag[i] == elem) {
      return i;
    }
  }
  return -1;
};


/**
 * Callback on a get context menu event.
 * @param {Event} event The get context event.
 * @private
 */
rpf.ContentScript.RecordHelper.prototype.getContextMenu_ = function(event) {
  event.stopPropagation();
  event.preventDefault();
};


/**
 * Call back function for catching the onblur event on related divs.
 * @param {Event} event The event object.
 * @private
 */
rpf.ContentScript.RecordHelper.prototype.contentEditableOnBlur_ =
    function(event) {
  event.stopPropagation();
  var elem = event.srcElement;
  this.sendActionBack(elem, elem.innerHTML, 'replaceHtml', event);
};


/**
 * Add listeners to content editable divs.
 * @private
 */
rpf.ContentScript.RecordHelper.prototype.addListenersToContentEditables_ =
    function() {
  var attrName = 'contenteditable';
  var divs = goog.dom.getElementsByTagNameAndClass(goog.dom.TagName.DIV);
  for (var i = 0; i < divs.length; i++) {
    var attr = divs[i].attributes.getNamedItem(attrName);
    if (attr) {
      divs[i].onblur = goog.bind(this.contentEditableOnBlur_, this);
    }
  }
};


/**
 * Checks if the given element is within the recording area.
 * @param {Element} elem The element object.
 * @return {boolean} Wether the element is in recording area.
 * @private
 */
rpf.ContentScript.RecordHelper.prototype.checkInRecordingArea_ = function(
    elem) {
  if (elem) {
    var biteConsole = goog.dom.getElement('bite-locator-console-container');
    if (biteConsole && goog.dom.contains(biteConsole, elem)) {
      return false;
    }
  }
  return true;
};


/**
 * Mouse click handler.
 * @param {Event} e The event object.
 * @private
 */
rpf.ContentScript.RecordHelper.prototype.mouseUpHandler_ = function(e) {
  if (e.button == 0) {
    var dx = e.screenX - this.currentElemCursorPos['x'];
    var dy = e.screenY - this.currentElemCursorPos['y'];
    if ((dx < 10 && dx > -10) && (dy < 10 && dy > -10)) {
      console.log('Minor mouse drag, ignore.');
      return;
    } else {
      if (this.checkInRecordingArea_(this.curMouseDownElement_)) {
        console.log('Visible mouse drag, will record.');
        this.sendActionBack(this.elemUnderCursor_, dx + 'x' + dy, 'drag', e);
      }
    }
  }
};


/**
 * Mouse click handler.
 * @param {Event} e The event object.
 * @private
 */
rpf.ContentScript.RecordHelper.prototype.mouseDownHandler_ = function(e) {
  if (!this.elemUnderCursor_) {
    this.elemUnderCursor_ = /** @type {Element} */ (e.target);
  }
  var content = this.elemDescriptor_.getText(this.elemUnderCursor_);
  if (e.button == 0 && this.recordingMode_ == 'rpf') {
    this.currentElemCursorPos = {'x': e.screenX, 'y': e.screenY};
    if (this.elemUnderCursor_.tagName.toLowerCase() != 'select') {
      this.curMouseDownElement_ = this.elemUnderCursor_;
      this.sendActionBack(this.elemUnderCursor_, content, 'click', e);
    }
  } else if (e.button == 2) {
    this.sendActionBack(this.elemUnderCursor_, content, 'rightclick', e);
  }
};


/**
 * Mouse click handler.
 * @param {Event} e The event object.
 * @private
 */
rpf.ContentScript.RecordHelper.prototype.submitHandler_ = function(e) {
  this.sendActionBack(/** @type {Element} */ (e.target), '', 'submit', e);
};


/**
 * Toggles to show attributes in dialog on hover over.
 * @private
 */
rpf.ContentScript.RecordHelper.prototype.toggleHoverShowAttr_ = function() {
  this.hoverToShowAttr_ = !this.hoverToShowAttr_;
};


/**
 * Mouse click handler.
 * @param {Event} e The event object.
 * @private
 */
rpf.ContentScript.RecordHelper.prototype.keyDownHandler_ = function(e) {
  var keynum = e.keyCode;
  if (this.recordingMode_ == 'rpf' && keynum == goog.events.KeyCodes.ENTER) {
    this.sendActionBack_([''], '', '', 'enter', '', '');
  } else if (keynum == goog.events.KeyCodes.SHIFT) {
    this.toggleHoverShowAttr_();
  }
};


/**
 * Mouse click handler.
 * @param {Event} e The event object.
 * @private
 */
rpf.ContentScript.RecordHelper.prototype.changeHandler_ = function(e) {
  console.log('onchange event caught.');
  var elem = /** @type {Element} */ (e.target);
  if (!this.checkApplicableAsInput_(elem)) {
    console.log('The element is a checkbox or radio button, discard.');
    return;
  }
  var eventType = 'change';
  var upperTagName = elem.tagName.toUpperCase();
  if (upperTagName == goog.dom.TagName.INPUT) {
    eventType = 'type';
  } else if (upperTagName == goog.dom.TagName.SELECT) {
    eventType = 'select';
  }
  this.sendActionBack(elem, elem.value, eventType, e);
};


/**
 * Reverts the outline style back to element's original style.
 * @param {Element} elem The element.
 * @return {Element} The element whose outline is reverted.
 * @private
 */
rpf.ContentScript.RecordHelper.prototype.revertOutline_ = function(elem) {
  goog.style.setStyle(elem, 'outline', this.outlineOfCurrentElem_);
  return elem;
};


/**
 * Highlights the outline style.
 * @param {Element} elem The element.
 * @param {string=} opt_outline The optional outline.
 * @private
 */
rpf.ContentScript.RecordHelper.prototype.highlightOutline_ = function(
    elem, opt_outline) {
  elem.style.outline = opt_outline || 'medium solid yellow';
};


/**
 * Mouse click handler.
 * @param {Event} e The event object.
 * @private
 */
rpf.ContentScript.RecordHelper.prototype.mouseOverHandler_ = function(e) {
  if (this.elemUnderCursor_) {
    this.revertOutline_(this.elemUnderCursor_);
  }
  this.elemUnderCursor_ = /** @type {Element} */ (e.target);
  this.outlineOfCurrentElem_ = this.elemUnderCursor_.style.outline;
  // Outline elements on mouse over, if rpf Console UI is constructed.
  if (!this.noConsole_ &&
      this.checkInRecordingArea_(this.elemUnderCursor_)) {
    this.showLocatorMethods_();
    this.highlightOutline_(this.elemUnderCursor_);
  }
};


/**
 * Mouse click handler.
 * @param {Event} e The event object.
 * @private
 */
rpf.ContentScript.RecordHelper.prototype.mouseOutHandler_ = function(e) {
  e.target.style.outline = '';
};


/**
 * Mouse click handler.
 * @param {Event} e The event object.
 * @private
 */
rpf.ContentScript.RecordHelper.prototype.dblClickHandler_ = function(e) {
  if (!this.elemUnderCursor_) {
    this.elemUnderCursor_ = /** @type {Element} */ (e.target);
  }
  this.sendActionBack(
      this.elemUnderCursor_,
      this.elemDescriptor_.getText(this.elemUnderCursor_),
      'doubleClick',
      e);
};


/**
 * Stops recording mode experiment.
 * @export
 */
rpf.ContentScript.RecordHelper.prototype.stopRecording = function() {
  goog.events.unlisten(goog.global.document,
                       'mousedown',
                       this.onMouseDownHandler_,
                       true);
  goog.events.unlisten(goog.global.document,
                       'mouseover',
                       this.onMouseOverHandler_,
                       true);
  goog.events.unlisten(goog.global.document,
                       'mouseout',
                       this.onMouseOutHandler_,
                       true);
  goog.events.unlisten(goog.global.document,
                       'change',
                       this.onChangeHandler_,
                       true);
  goog.events.unlisten(goog.global.document,
                       'submit',
                       this.onSubmitHandler_,
                       true);
  goog.events.unlisten(goog.global.document,
                       'keydown',
                       this.onKeyDownHandler_,
                       true);
  goog.events.unlisten(goog.global.document,
                       'dblclick',
                       this.onDblClickHandler_,
                       true);
  goog.events.unlisten(goog.global.document,
                       'mouseup',
                       this.onMouseUpHandler_,
                       true);
  if (!this.noConsole_) {
    goog.global.document.oncontextmenu = this.originalContextMenu_;
    if (this.finderConsole_) {
      this.hideFinderConsole_();
    }
  }
};


/**
 * Starts recording mode experiment.
 * @param {boolean=} opt_noConsole Whether recording is with console or not.
 * @export
 */
rpf.ContentScript.RecordHelper.prototype.startRecording = function(
    opt_noConsole) {
  this.recordingMode_ = 'rpf';
  this.noConsole_ = !!opt_noConsole;
  this.stopRecording();
  goog.events.listen(goog.global.document,
                     'mousedown',
                     this.onMouseDownHandler_,
                     true);
  goog.events.listen(goog.global.document,
                     'mouseover',
                     this.onMouseOverHandler_,
                     true);
  goog.events.listen(goog.global.document,
                     'mouseout',
                     this.onMouseOutHandler_,
                     true);
  goog.events.listen(goog.global.document,
                     'change',
                     this.onChangeHandler_,
                     true);
  goog.events.listen(goog.global.document,
                     'submit',
                     this.onSubmitHandler_,
                     true);
  goog.events.listen(goog.global.document,
                     'keydown',
                     this.onKeyDownHandler_,
                     true);
  goog.events.listen(goog.global.document,
                     'dblclick',
                     this.onDblClickHandler_,
                     true);
  goog.events.listen(goog.global.document,
                     'mouseup',
                     this.onMouseUpHandler_,
                     true);
  if (!this.noConsole_) {
    this.originalContextMenu_ = goog.global.document.oncontextmenu;
    goog.global.document.oncontextmenu = goog.bind(this.getContextMenu_, this);
    this.addListenersToContentEditables_();
    if (window == window.parent) {
      this.openLocatorDialog_();
    }
  }
};


/**
 * Check whether this is applicable.
 * @param {Object} elem The element was interacted with.
 * @return {boolean} Whether the event triggered as input is applicable.
 * @private
 */
rpf.ContentScript.RecordHelper.prototype.checkApplicableAsInput_ =
    function(elem) {
  return !(elem && elem.type && (elem.type == 'checkbox' ||
                                 elem.type == 'radio'));
};


/**
 * Gets the xpath of the given element.
 * @param {Element} elem The element was interacted with.
 * @return {string} The xpath string.
 * @private
 */
rpf.ContentScript.RecordHelper.prototype.getXpathStr_ = function(elem) {
  var defaultXpath = this.elemDescriptor_.generateXpath(
      elem, {'id': null}, {'id': null});
  for (var xpath in this.elementXpathMap_) {
    if (xpath == defaultXpath) {
      return this.elementXpathMap_[xpath];
    }
  }
  return defaultXpath;
};


/**
 * Sends an action related info to background page.
 * @param {Element} elem The target element.
 * @param {string} content The content in the target element.
 * @param {string} action The action performed.
 * @param {Event} event The event object.
 * @export
 */
rpf.ContentScript.RecordHelper.prototype.sendActionBack = function(
    elem, content, action, event) {
  if (!this.checkInRecordingArea_(elem)) {
    return;
  }
  var descriptorStr = this.elemDescriptor_.generateElementDescriptor(
      this.revertOutline_(elem), 2, false);
  this.highlightOutline_(elem);
  var elemVarName = this.createVarName_(elem);
  var selectors = [this.elemDescriptor_.generateSelector(elem),
                   this.elemDescriptor_.generateSelectorPath(
                       /** @type {!Node} */ (elem))];
  var xpaths = [this.getXpathStr_(elem)];
  var tagName = elem.tagName;
  this.sendActionBack_(
      selectors, content, tagName, action, descriptorStr, elemVarName,
      elem, event, xpaths);
};


/**
 * Sends an action related info to background page.
 * @param {Array} selectors The array of selectors.
 * @param {string} content The content in the target element.
 * @param {string} nodeType The node type of the element.
 * @param {string} action The action performed.
 * @param {string} descriptor The descriptor of the element.
 * @param {string=} opt_elemVarName The variable name of the element.
 * @param {Element=} opt_elem The element.
 * @param {Event=} opt_event The event object.
 * @param {Array=} opt_xpaths The xpath array.
 * @private
 */
rpf.ContentScript.RecordHelper.prototype.sendActionBack_ = function(
    selectors, content, nodeType,
    action, descriptor, opt_elemVarName,
    opt_elem, opt_event, opt_xpaths) {
  if (!this.checkInRecordingArea_(opt_elem || this.elemUnderCursor_)) {
    return;
  }
  var elemVarName = opt_elemVarName || '';
  var xpaths = opt_xpaths || [];
  console.log('Caught event: ' + action);
  if (this.noConsole_ && action == 'rightclick') {
    return;
  }
  var iframeInfo = null;
  // Assign the iframeInfo only if it's in an iframe window.
  if (window != window.parent) {
    iframeInfo = {'host': window.location.host,
                  'pathname': window.location.pathname};
  }
  var position = null;
  if (opt_elem) {
    var pos = goog.style.getClientPosition(opt_elem);
    var size = goog.style.getSize(opt_elem);
    var eX = 0;
    var eY = 0;
    if (opt_event) {
      eX = opt_event.clientX;
      eY = opt_event.clientY;
    }
    position = {'x': pos.x,
                'y': pos.y,
                'width': size.width,
                'height': size.height,
                'eX': eX,
                'eY': eY};
  }
  chrome.extension.sendRequest({'command': 'GetActionInfo',
                                'selectors': selectors,
                                'content': escape(content),
                                'nodeType': nodeType,
                                'action': action,
                                'descriptor': descriptor,
                                'elemVarName': elemVarName,
                                'iframeInfo': iframeInfo,
                                'position': position,
                                'noConsole': this.noConsole_,
                                'mode': this.recordingMode_,
                                'xpaths': xpaths});
};


/**
 * Enum for the received request command.
 * @enum {string}
 * @export
 */
rpf.ContentScript.RecordHelper.ReqCmds = {
  TEST_DESCRIPTOR: 'testDescriptor',
  TEST_LOCATOR: 'testLocator'
};


/**
 * Callback for the onRequest listener.
 * @param {Object} request The request object.
 * @param {Object} sender The sender object.
 * @param {function(Object)} sendResponse The sendResponse object used
 *     to send back results.
 * @private
 */
rpf.ContentScript.RecordHelper.prototype.callBackAddOnRequest_ = function(
    request, sender, sendResponse) {
  switch (request.command) {
    case rpf.ContentScript.RecordHelper.ReqCmds.TEST_DESCRIPTOR:
      var result = 'pass';
      try {
        var desc = (/** @type {string} */ request['descriptor']);
        this.outlineElems_(desc);
      } catch (e) {
        result = e.message;
      }
      sendResponse({result: result});
      break;
    case rpf.ContentScript.RecordHelper.ReqCmds.TEST_LOCATOR:
      var results = [];
      var locators = request['locators'];
      for (var i = 0, len = locators.length; i < len; ++i) {
        var loc = locators[i];
        var passed = false;
        var elem = common.client.ElementDescriptor.getElemBy(
            loc['method'], loc['value']);
        if (elem && elem.style) {
          if (loc['show']) {
            elem.style.outline = 'medium solid red';
          } else {
            elem.style.outline = '';
          }
          passed = true;
        }
        results.push({'id': loc['id'], 'passed': passed, 'show': loc['show']});
      }
      sendResponse({'results': results});
      break;
  }
};


/**
 * Enters locator updater mode.
 * @export
 */
rpf.ContentScript.RecordHelper.prototype.enterUpdaterMode = function() {
  this.recordingMode_ = 'updater';
  goog.events.listen(goog.dom.getDocument(),
      'mousedown',
      this.onMouseDownHandler_,
      true);
  goog.events.listen(goog.dom.getDocument(),
      'mouseover',
      this.onMouseOverHandler_,
      true);
  goog.events.listen(goog.dom.getDocument(),
      'mouseout',
      this.onMouseOutHandler_,
      true);
  goog.events.listen(goog.dom.getDocument(),
      'keydown',
      this.onKeyDownHandler_,
      true);
  chrome.extension.onRequest.removeListener(
      goog.bind(this.callBackAddOnRequest_, this));
  chrome.extension.onRequest.addListener(
      goog.bind(this.callBackAddOnRequest_, this));
  if (goog.global.window == goog.global.window.parent) {
    this.openLocatorDialog_();
  }
};


/**
 * Ends locator updater mode.
 * @export
 */
rpf.ContentScript.RecordHelper.prototype.endUpdaterMode = function() {
  goog.events.unlisten(goog.dom.getDocument(),
      'mousedown',
      this.onMouseDownHandler_,
      true);
  goog.events.unlisten(goog.dom.getDocument(),
      'mouseover',
      this.onMouseOverHandler_,
      true);
  goog.events.unlisten(goog.dom.getDocument(),
      'mouseout',
      this.onMouseOutHandler_,
      true);
  goog.events.unlisten(goog.dom.getDocument(),
      'keydown',
      this.onKeyDownHandler_,
      true);
  chrome.extension.onRequest.removeListener(
      goog.bind(this.callBackAddOnRequest_, this));
  if (this.finderConsole_) {
    this.hideFinderConsole_();
  }
};


/**
 * Adds the onRequest listener.
 * @export
 */
rpf.ContentScript.RecordHelper.prototype.addOnRequestListener = function() {
  chrome.extension.onRequest.removeListener(
      goog.bind(this.callBackAddOnRequest_, this));
  chrome.extension.onRequest.addListener(
      goog.bind(this.callBackAddOnRequest_, this));
};


/**
 * Outlines the found elements.
 * @param {string} descriptor The descriptor object.
 * @private
 */
rpf.ContentScript.RecordHelper.prototype.outlineElems_ = function(
    descriptor) {
  var result = this.elemDescriptor_.parseElementDescriptor(descriptor);
  if (!result['elems']) {
    // TODO(phu): Display info on console instead of alerts.
    alert('There is no matched element.');
    return;
  }
  var elems = result['elems'];
  elems = elems.length == undefined ? [elems] : elems;
  for (var i = 0; i < elems.length; ++i) {
    var elem = elems[i];
    goog.style.setStyle(elem, 'outline', 'medium solid blue');
    goog.Timer.callOnce(
        function() {goog.style.setStyle(elem, 'outline', '');},
        1500);
  }
};


/**
 * The RecordHelper instance.
 * @export
 */
var recordHelper = new rpf.ContentScript.RecordHelper();


/**
 * Get a random int.
 * @return {number} A random int number.
 * @export
 */
rpf.ContentScript.RecordHelper.randomInt = function() {
  return Math.floor(Math.random() * rpf.ContentScript.RecordHelper.MAX_);
};


/**
 * Sent the page loaded message to background page.
 * @export
 */
rpf.ContentScript.RecordHelper.run = function() {
  chrome.extension.sendRequest(
      {command: Bite.Constants.CONSOLE_CMDS.RECORD_PAGE_LOADED_COMPLETE,
       url: window.location.href});
};


/**
 * Starts auto recording.
 * @private
 */
rpf.ContentScript.RecordHelper.startAutoRecord_ = function() {
  chrome.extension.sendRequest(
      {command: Bite.Constants.CONTROL_CMDS.OPEN_CONSOLE_AUTO_RECORD},
      rpf.ContentScript.RecordHelper.startAutoRecordCallback);
};


/**
 * The callback for starting auto record.
 * @param {Object} response The response object.
 * @export
 */
rpf.ContentScript.RecordHelper.startAutoRecordCallback = function(response) {
  if (response['result']) {
    chrome.extension.sendRequest(
      {command: Bite.Constants.CONSOLE_CMDS.START_AUTO_RECORD});
    rpf.ContentScript.RecordHelper.randomActions();
  }
};


/**
 * Randomly click on a link in a page.
 * @export
 */
rpf.ContentScript.RecordHelper.randomActions = function() {
  var aTags = document.querySelectorAll('a');
  if (!aTags) {
    return;
  }
  var selectedElem = aTags[Math.floor(Math.random() * aTags.length)];
  goog.Timer.callOnce(
      function() {rpf.ContentScript.RecordHelper.randomActions();}, 4000);
};


// Execute the run function only if it's in the main window.
if (window == window.parent) {
  rpf.ContentScript.RecordHelper.run();
  var href = window.location.href;
  if (href.indexOf('localhost:7171') != -1) {
    var uri = new goog.Uri(href);
    var queryData = uri.getQueryData();
    var keys = queryData.getKeys();
    var parameters = {};
    for (var i = 0, len = keys.length; i < len; ++i) {
      parameters[keys[i]] = queryData.get(keys[i]);
    }
    chrome.extension.sendRequest({
      'command': Bite.Constants.CONSOLE_CMDS.AUTOMATE_RPF,
      'params': parameters});
  }
}

