"use strict";

import * as clc from "colorette";
import { Command } from "../command";
import { Emulators } from "../emulator/types";
import { printNoticeIfEmulated } from "../emulator/commandUtils";
import { FirestoreDelete } from "../firestore/delete";
import { FirestoreProvisioning } from "../firestore/provisioning";
import { promptOnce } from "../prompt";
import { requirePermissions } from "../requirePermissions";
import * as utils from "../utils";

function getConfirmationMessage(deleteOp: FirestoreDelete, options: any) {
  if (options.allCollections) {
    return (
      "You are about to delete " +
      clc.bold(clc.yellow(clc.underline("THE ENTIRE DATABASE"))) +
      " for " +
      clc.cyan(deleteOp.getRoot()) +
      ". Are you sure?"
    );
  }

  if (deleteOp.isDocumentPath) {
    // Recursive document delete
    if (options.recursive) {
      return (
        "You are about to delete the document at " +
        clc.cyan(deleteOp.path) +
        " and all of its subcollections " +
        " for " +
        clc.cyan(deleteOp.getRoot()) +
        ". Are you sure?"
      );
    }

    // Shallow document delete
    return (
      "You are about to delete the document at " +
      clc.cyan(deleteOp.path) +
      " for " +
      clc.cyan(deleteOp.getRoot()) +
      ". Are you sure?"
    );
  }

  // Recursive collection delete
  if (options.recursive) {
    return (
      "You are about to delete all documents in the collection at " +
      clc.cyan(deleteOp.path) +
      " and all of their subcollections " +
      " for " +
      clc.cyan(deleteOp.getRoot()) +
      ". Are you sure?"
    );
  }

  // Shallow collection delete
  return (
    "You are about to delete all documents in the collection at " +
    clc.cyan(deleteOp.path) +
    " for " +
    clc.cyan(deleteOp.getRoot()) +
    ". Are you sure?"
  );
}

export const command = new Command("firestore:delete [path]")
  .description("Delete data from Cloud Firestore.")
  .option(
    "-r, --recursive",
    "Recursive. Delete all documents and subcollections at and under the " +
      "specified level. May not be passed along with --shallow."
  )
  .option(
    "--shallow",
    "Shallow. Delete only documents at the specified level and ignore documents in " +
      "subcollections. This action can potentially orphan documents nested in " +
      "subcollections. May not be passed along with -r."
  )
  .option(
    "--all-collections",
    "Delete all. Deletes the entire Firestore database, " +
      "including all collections and documents. Any other flags or arguments will be ignored."
  )
  .option("-f, --force", "No confirmation. Otherwise, a confirmation prompt will appear.")
  .option(
    "--database <databaseId>",
    "Database ID for database to delete from. Mandatory if more than 1 database present."
  )
  .before(printNoticeIfEmulated, Emulators.FIRESTORE)
  .before(requirePermissions, ["datastore.entities.list", "datastore.entities.delete"])
  .action(async (path: string | undefined, options: any) => {
    // Guarantee path
    if (!path && !options.allCollections) {
      return utils.reject("Must specify a path.", { exit: 1 });
    }

    if (!options.database) {
      const provisioningApi = new FirestoreProvisioning(options.project);
      const databases: string[] = await provisioningApi.listDatabaseNames();
      if (!databases || databases.length !== 1) {
        return utils.reject("Must specify database when more than 1 present in project.", {
          exit: 1,
        });
      } else {
        options.database = databases[0];
      }
    }

    const deleteOp = new FirestoreDelete(options.project, path, {
      recursive: options.recursive,
      shallow: options.shallow,
      allCollections: options.allCollections,
      databaseId: options.database,
    });

    const confirm = await promptOnce(
      {
        type: "confirm",
        name: "force",
        default: false,
        message: getConfirmationMessage(deleteOp, options),
      },
      options
    );
    if (!confirm) {
      return utils.reject("Command aborted.", { exit: 1 });
    }

    if (options.allCollections) {
      return deleteOp.deleteDatabase();
    }

    return deleteOp.execute();
  });
