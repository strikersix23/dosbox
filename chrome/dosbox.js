// Copyright (C) 2013 Che-Liang Chiou.


function Module() {
  var self = this;

  var container = null;
  var module = null;

  function load() {
    container = $('#nacl-module-container')[0];
    container.addEventListener('load', onLoad, true);
    container.addEventListener('message', onMessage, true);
    $('<embed/>', {attr: {
      id: 'nacl-module',
      src: 'dosbox.nmf',
      type: 'application/x-nacl',
    }}).addClass('nacl-module').appendTo(container);
  }
  self.load = load;

  function unload() {
    container.removeEventListener('load', onLoad, true);
    container.removeEventListener('message', onMessage, true);
    $('#nacl-module').remove();
    container = null;
    module = null;
    if (self.onUnload) {
      self.onUnload();
    }
  }
  self.unload = unload;

  function postMessage(message) {
    module.postMessage(message);
  }
  self.postMessage = postMessage;

  function onLoad() {
    $('#nacl-module').focus();
    module = $('#nacl-module')[0];
  }

  function onMessage(message) {
    if (typeof message.data !== 'string') {
      console.log('Message is not a string: message=' + message);
      return;
    }
    console.log('message=' + message.data);
    message = JSON.parse(message.data);
    if (message.type === 'sys') {
      if (message.action === 'quit') {
        unload();
        return;
      }
    }
  }

  return self;
}


// TODO(clchiou): Warn user that he should not choose symlink; otherwise
// Chrome will silently ignore it :(
function LocalFileSystem() {
  var self = this;

  function requestFileSystem(onFileSystem, onError) {
    onFileSystem(self);
  }
  self.requestFileSystem = requestFileSystem;

  function getDirectory(onDirectory, onError) {
    chrome.fileSystem.chooseEntry({
      type: 'openDirectory',
    }, onDirectory);
  }
  self.getDirectory = getDirectory;

  return self;
}


function Html5FileSystem(requestFs, path) {
  var self = this;

  var fs = null;

  function requestFileSystem(onFileSystem, onError) {
    requestFs(function (fs_) {
      fs = fs_;
      console.log('html5fs: ' + fs.root.toURL());
      onFileSystem(self);
    },
    onError);
  }
  self.requestFileSystem = requestFileSystem;

  function getDirectory(onDirectory, onError) {
    console.log('html5fs: path=' + path);
    if (path === '/') {
      onDirectory(fs.root);
    } else {
      fs.root.getDirectory(path, {create: true}, onDirectory, onError);
    }
  }
  self.getDirectory = getDirectory;

  return self;
}


function copyDirectory(src, dst, override, onSuccess, onError) {
  // XXX This is madness! We should not nest this deep!

  src.requestFileSystem(function () {
  src.getDirectory(function (srcEntry) {
  if (srcEntry === undefined) {
    onError({name: 'Could not copy from undefined'});
    return;
  }

  dst.requestFileSystem(function () {
  dst.getDirectory(function (dstEntry) {
  if (dstEntry === undefined) {
    onError({name: 'Could not copy to undefined'});
    return;
  }

  if (override) {
    // If destination directory is not empty, Chrome cannot override it.
    // So remove destination before copy.
    dstEntry.getDirectory(srcEntry.name, {}, function (targetEntry) {
    console.log('Remove ' + targetEntry.fullPath);
    targetEntry.removeRecursively(function () {

    dst.getDirectory(function (dstEntry) {
    if (dstEntry === undefined) {
      onError({name: 'Could not copy to undefined'});
      return;
    }
    console.log('Copy ' + srcEntry.fullPath + ' to ' + dstEntry.fullPath);
    srcEntry.copyTo(dstEntry, null, onSuccess, onError);

    }, onError);
    }, onError);
    }, onError);
  } else {
    console.log('Copy ' + srcEntry.fullPath + ' to ' + dstEntry.fullPath);
    srcEntry.copyTo(dstEntry, null, onSuccess, onError);
  }

  }, onError);
  }, onError);
  }, onError);
  }, onError);
}


function exportCDriveArchive(cDriveArchive) {
  console.log('Export C Drive');
  requestHtml5FileSystem(function (fs) {
  fs.root.getFile(cDriveArchive, {}, function (srcEntry) {
  chrome.fileSystem.chooseEntry({type: 'saveFile'}, function (dstEntry) {
  if (chrome.runtime.lastError) {
    onError(chrome.runtime.lastError);
    return;
  }
  copyFile(srcEntry, dstEntry);
  });
  }, onError);
  }, onError);
}


function dirForEach(fileSystem, func) {
  fileSystem.requestFileSystem(function (fs) {
  fs.getDirectory(function (dirEntry) {
  var dirReader = dirEntry.createReader();

  function readEntries() {
    dirReader.readEntries(function (results) {
    if (results.length) {
      for (var i = 0; i < results.length; i++) {
        func(results[i]);
      }
      readEntries();
    }
    });
  }
  readEntries();

  });
  });
}


function remove(entry) {
  if (entry.isFile) {
    entry.remove(function () {
      console.log('Remove file ' + entry.fullPath);
    }, onError);
  } else {
    entry.removeRecursively(function () {
      console.log('Remove directory ' + entry.fullPath);
    }, onError);
  }
}


function requestHtml5FileSystem(onFileSystem, onError) {
  // TODO(clchiou): Pass quota (and other information) to NaCl module
  var quota = 1024 * 1024 * 1024; // 1 GB

  var requestFs = window.requestFileSystem || window.webkitRequestFileSystem;
  requestFs(window.PERSISTENT, quota, onFileSystem, onError);
}


function showStatus(message) {
  $('#status').text(message).fadeOut(3000, function() {
    $('#status').text('').show();
  });
}


function onError(error) {
  console.log('Error: ' + error.name);
  showStatus('Failed');
}


function exit() {
  showStatus('Exit');
  chrome.app.window.current().close();
}


function main() {
  // TODO(clchiou): Let pepper.cpp and here read this path from a config file?
  var cDrivePath = '/c_drive';

  function onSuccess() {
    console.log('copyDirectory: Success');
    showStatus('Success');
  }

  $('#copy').click(function () {
    console.log('Copy Directory');
    showStatus('Copying...');
    copyDirectory(
      new LocalFileSystem(),
      new Html5FileSystem(requestHtml5FileSystem, cDrivePath),
      true,
      onSuccess,
      onError);
  });

  $('#export').click(function () {
    console.log('Export C Drive');
    copyDirectory(
      new Html5FileSystem(requestHtml5FileSystem, cDrivePath),
      new LocalFileSystem(),
      false,
      onSuccess,
      onError);
  });

  $('#remove').click(function () {
    showStatus('Removing...');
    dirForEach(new Html5FileSystem(requestHtml5FileSystem, cDrivePath),
      remove);
  });

  $('#show').click(function () {
    $('#show').hide('slow');
    $('#toolbar').show('slow');
  });

  $('#show').hide();

  $('#hide').click(function () {
    $('#show').show('slow');
    $('#toolbar').slideUp('slow');
  });

  var module = new Module();
  module.onUnload = exit;
  module.load();
}


$(document).ready(main);
