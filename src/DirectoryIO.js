var mFs = require('fs');
var mBuffer = require('buffer');
var mPath = require('path');

var mFileIO = require('./FileIO.js');

var fileIO = new mFileIO();

function Directory(path, stat){
    this.stat_ = stat;
    this.path_ = path;
}
Directory.prototype = {
    get Stat(){
        return this.stat_;
    },
    get Path(){
        return this.path_;
    }
}
Directory.prototype.GetFiles = function (context) { 
	Directory.GetFiles(this, context);
}
Directory.prototype.GetDirectories = function (context){
	Directory.GetDirectories(this, context);
}
Directory.prototype.CreateChild = function (childDirectoryName, context){
	Directory.Create(mPath.join(this.path_, childDirectoryName), context);
}
Directory.prototype.DeleteChild = function (childDirectoryName, context){
	Directory.Delete(mPath.join(this.path_, childDirectoryName), context);
}
Directory.prototype.CreateFile = function (fileName, force, context){
	fileIO.File.Create(mPath.join(this.path_, fileName), force, context);
}

Directory.Create = function (path, context){
	
	var lStat = function (context, stat){
		var lErr = null;
		var lDir = null;
		if (stat.isDirectory()) {
			lDir = new Directory(path, stat);
		}
		else {
			lErr = new Error("Path '" + path + "' is not a directory.");
		}
		context.task.Next(lErr, lDir);
	}
	
	var lMkDir = function (context) {
		mFs.mkdir(path, function (err) {
			if (err) context.task.Next(err);
			else {
				mFs.stat(path, function (statErr, stat) {
					context.task.Continue(lStat);
					context.task.Next(statErr, stat);
				});
			}
		})
	}

	mFs.stat(path, function (err, stat) {
		if (err && (err.errno === 34 || err.errno === -4058)) {
			context.task.Continue(lMkDir);
			context.task.Next();
		}
		else if (err)
			context.task.Next(err);
		else {
			context.task.Continue(lStat);
			context.task.Next(null, stat);
		}
	});
}

function deleteDir(basePath, currentPath, context) {
	
	function readDir(path, context) {
		mFs.readdir(path, function (err, files) {
			context.task.Next(err, path, files);
		});
	}

	var lStats = function (context, currPath, stats, fileName, filesNamesArray){
		if (stats !== undefined && stats != null) {
			var lCurrPath = currPath + "/" + fileName;
			if (stats.isDirectory()) {
				// go to directory and read
				deleteDir(basePath, lCurrPath, context);
			}
			else if (stats.isFile()) {
				// delete file and go to next fs object
				mFs.unlink(lCurrPath, function (err) {
					if (err)
						context.task.Next(err);
					else {
						context.task.Continue(lGettedFiles);
						context.task.Next(null, currPath, filesNamesArray);
					}
				});
			}
			else {// unhandled exception
				var lErr = new Error("FS object is not a dir or file.");
				context.task.Next(lErr);
			}
		}
		else {
			var lErr = new Error("[DirectoryIO] \'deleteDir\': unhandled exception (stats of FS object is null or undefined!).");
			context.task.Next(lErr);
		}
	}

	var lGettedFiles = function (context, currPath, files){
		var lFile = files.shift();
		if (lFile === undefined) {
			mFs.rmdir(currPath, function (err) {
				if (err || basePath == currentPath)
					context.task.Next(err);
				else {
					var lParentPath = mPath.dirname(currPath);
					deleteDir(basePath, lParentPath, context);
				}
			});
		}
		else {
			context.task.Continue(lStats);
			mFs.lstat(currPath + "/" + lFile, function (err, stats) {
				context.task.Next(err, currPath, stats, lFile, files);
			});
		}
	}

	context.task.Continue(lGettedFiles);
	readDir(currentPath, context);
}

Directory.Delete = function (directory, context) {
	var lPath = null;
	if (directory instanceof Directory)
		lPath = directory.Path;
	else if (typeof directory == 'string')
		lPath = directory;
	deleteDir(lPath, lPath, context);
}
Directory.DirectoryFromPath = function (path, context) {
	mFs.stat(path, function (err, stat) { 
		context.task.Next(err, new Directory(path, stat));
	});
}
Directory.GetFiles = function (directory, context) {
	var lPath = null;
	if (directory instanceof Directory) {
		lPath = directory.Path;
	}
	else if (typeof directory == 'string') {
		lPath = directory;
	}
	else {
		context.task.Next(new Error("The 'directory' parameter is not of string path or object of 'Directory' type."));
		return;
	}
	
	mFs.readdir(lPath, function (err, files) {
		context.task.Next(err, files);
	});
}
Directory.GetDirectories = function (directory, context) {
	var lPath = null;
	if (directory instanceof Directory) {
		lPath = directory.Path;
	}
	else if (typeof directory == 'string') {
		lPath = directory;
	}
	else {
		context.task.Next(new Error("The 'directory' parameter is not of string path or object of 'Directory' type."));
		return;
	}
	
	var lDirs = [];

	var lStat = function (context, stat, currName, names){
		if (currName == null || currName === undefined)
			context.task.Next(null, lDirs);
		else {
			if (stat != null && stat !== undefined && stat.isDirectory()) {
				lDir.push(new Directory(currName, stat));
			}
			context.task.Continue(lGetStatNextDir);
			context.task.Next(null, names);
		}
	}
	
	var lGetStatNextDir = function (context, names){
		var lName = names.shift();
		context.task.Continue(lStat);
		mFs.stat(lName, function (err, stat) {
			context.task.Next(null, stat, name, names);
		});
	}
	
	context.task.Continue(lGetStatNextDir);
	mFs.readdir(lPath, function (err, names) {
		context.task.Next(err, names);
	});
}

module.exports = function () {
    this.Directory = Directory;
}